import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  gauntletRunCasesTable,
  gauntletRunsTable,
  type GauntletRunCaseRow,
  type GauntletRunRow,
} from "@workspace/db";
import type {
  ChaosConfig,
  GauntletCase,
  GauntletRun,
} from "./gauntlet";
import { computeRunBundleDigest } from "./gauntlet";
import { canonicalizeRunForDatabase } from "./run-canonical";

function caseFromRow(row: GauntletRunCaseRow): GauntletCase {
  return {
    id: row.caseId,
    title: row.title,
    category: row.category,
    severity: row.severity as GauntletCase["severity"],
    status: row.status as GauntletCase["status"],
    input: row.input as Record<string, unknown>,
    expected: row.expected,
    actual: row.actual,
    expectedCanonical: row.expectedCanonical,
    actualCanonical: row.actualCanonical,
    byteDiff: row.byteDiff as GauntletCase["byteDiff"],
    durationMs: row.durationMs,
    citation: row.citation,
    evidence: row.evidence as GauntletCase["evidence"],
    ...(row.implementationId
      ? { implementationId: row.implementationId }
      : {}),
  };
}

function runFromRows(
  row: GauntletRunRow,
  cases: GauntletRunCaseRow[],
): GauntletRun {
  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.filter((item) => item.status === "fail").length;
  const unsupported = cases.filter((item) => item.status === "unsupported").length;
  const errors = cases.filter((item) => item.status === "error").length;
  const vectorIds = new Set(cases.map((item) => item.caseId));
  const divergences = [...vectorIds].some((caseId) => {
    const comparable = cases.filter(
      (item) =>
        item.caseId === caseId &&
        (item.status === "pass" || item.status === "fail"),
    );
    return (
      comparable.length > 1 &&
      new Set(comparable.map((item) => JSON.stringify(item.actual))).size > 1
    );
  });
  const status: GauntletRun["status"] =
    errors > 0
      ? "error"
      : failed > 0 || divergences
        ? "failed"
        : unsupported > 0
          ? "incomplete"
          : "passed";
  return {
    id: row.id,
    suiteId: row.suiteId,
    suiteVersion: row.suiteVersion,
    implementationId: row.implementationId,
    implementationIds:
      (row.implementationIds as string[] | null) ?? [row.implementationId],
    implementations:
      (row.implementations as GauntletRun["implementations"] | null) ?? undefined,
    contractDigest: row.contractDigest ?? undefined,
    vectorDigest: row.vectorDigest ?? undefined,
    bundleDigest: row.bundleDigest ?? undefined,
    summary:
      (row.comparisonSummary as GauntletRun["summary"] | null) ?? undefined,
    provenance:
      (row.provenance as GauntletRun["provenance"] | null) ?? undefined,
    seed: row.seed,
    mode: row.mode as GauntletRun["mode"],
    config: row.config as ChaosConfig,
    status,
    counts: {
      total: cases.length,
      passed,
      failed,
      unsupported,
      errors,
    },
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    replayOf: row.replayOf,
    cases: cases.map(caseFromRow),
  };
}

export async function persistRun(run: GauntletRun): Promise<void> {
  const canonicalRun = canonicalizeRunForDatabase(run);
  if (
    canonicalRun.bundleDigest !== computeRunBundleDigest(canonicalRun)
  ) {
    throw new Error("Run must be canonicalized and digested before persistence");
  }
  await db.transaction(async (tx) => {
    await tx.insert(gauntletRunsTable).values({
      id: canonicalRun.id,
      suiteId: canonicalRun.suiteId,
      suiteVersion: canonicalRun.suiteVersion,
      implementationId: canonicalRun.implementationId,
      seed: canonicalRun.seed,
      mode: canonicalRun.mode,
      config: canonicalRun.config,
      status: canonicalRun.status,
      totalCount: canonicalRun.counts.total,
      passedCount: canonicalRun.counts.passed,
      failedCount: canonicalRun.counts.failed,
      startedAt: new Date(canonicalRun.startedAt),
      finishedAt: new Date(canonicalRun.finishedAt),
      replayOf: canonicalRun.replayOf,
      implementationIds: canonicalRun.implementationIds,
      implementations: canonicalRun.implementations,
      contractDigest: canonicalRun.contractDigest,
      vectorDigest: canonicalRun.vectorDigest,
      bundleDigest: canonicalRun.bundleDigest,
      comparisonSummary: canonicalRun.summary,
      provenance: canonicalRun.provenance,
    });
    if (canonicalRun.cases.length > 0) {
      await tx.insert(gauntletRunCasesTable).values(
        canonicalRun.cases.map((item, ordinal) => ({
          runId: canonicalRun.id,
          ordinal,
          caseId: item.id,
          title: item.title,
          category: item.category,
          severity: item.severity,
          status: item.status,
          input: item.input,
          expected: item.expected,
          actual: item.actual,
          expectedCanonical: item.expectedCanonical,
          actualCanonical: item.actualCanonical,
          byteDiff: item.byteDiff,
          durationMs: item.durationMs,
          citation: item.citation,
          evidence: item.evidence,
          implementationId: item.implementationId,
        })),
      );
    }
  });
}

export async function findRun(id: string): Promise<GauntletRun | null> {
  const [row] = await db
    .select()
    .from(gauntletRunsTable)
    .where(eq(gauntletRunsTable.id, id))
    .limit(1);
  if (!row) return null;
  const cases = await db
    .select()
    .from(gauntletRunCasesTable)
    .where(eq(gauntletRunCasesTable.runId, id))
    .orderBy(asc(gauntletRunCasesTable.ordinal));
  return runFromRows(row, cases);
}

export async function listPersistedRuns(
  limit: number,
): Promise<GauntletRun[]> {
  const rows = await db
    .select()
    .from(gauntletRunsTable)
    .orderBy(desc(gauntletRunsTable.finishedAt))
    .limit(limit);
  return Promise.all(
    rows.map(async (row) => {
      const cases = await db
        .select()
        .from(gauntletRunCasesTable)
        .where(eq(gauntletRunCasesTable.runId, row.id))
        .orderBy(asc(gauntletRunCasesTable.ordinal));
      return runFromRows(row, cases);
    }),
  );
}