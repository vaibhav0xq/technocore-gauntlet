import {
  computeRunBundleDigest,
  executeRun,
  EXTERNAL_EVIDENCE_CERTIFICATION,
  EXTERNAL_EVIDENCE_DISCLAIMER,
  runGauntletSelfTest,
  SUITES,
  type GauntletRun,
} from "./gauntlet";
import { exportBundle, runToJUnit, validateImportedBundle } from "./bundles";
import { resolvePythonWorkerPath } from "./python-adapters";
import { findRun, persistRun } from "./gauntlet-store";
import { db, gauntletRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main(): Promise<void> {
  const deterministic = await runGauntletSelfTest();
  if (!deterministic.passed) {
    throw new Error(`Reference regression: ${deterministic.failures.join(", ")}`);
  }
  const roundTrip = await executeRun({
    suiteId: SUITES[0].id,
    seed: "database-round-trip-self-test",
    mode: "standard",
  });
  const unicodeInput = roundTrip.cases.find(
    (item) => item.id === "unicode-sweep",
  )?.input.text;
  if (
    typeof unicodeInput !== "string" ||
    !unicodeInput.includes("\\u0000") ||
    !unicodeInput.includes("\\uD800")
  ) throw new Error("Run was not database-safe before POST response");
  try {
    await persistRun(roundTrip);
    const reloaded = await findRun(roundTrip.id);
    if (!reloaded) throw new Error("Persisted run did not reload");
    const exported = exportBundle(reloaded);
    if (
      roundTrip.bundleDigest !== reloaded.bundleDigest ||
      computeRunBundleDigest(reloaded) !== reloaded.bundleDigest ||
      exported.digest !== reloaded.bundleDigest ||
      exported.run.bundleDigest !== reloaded.bundleDigest
    ) throw new Error("Database-safe digest round-trip regression");
  } finally {
    await db
      .delete(gauntletRunsTable)
      .where(eq(gauntletRunsTable.id, roundTrip.id));
  }
  const comparison = await executeRun({
    suiteId: SUITES[0].id,
    seed: "adapter-self-test",
    mode: "standard",
    implementationIds: [
      "technocore-ts-reference-local",
      "technocore-python-official-0.9.1",
      "zunmax-did-starter-3cc03a6",
    ],
  });
  const officialFailures = comparison.cases.filter(
    (item) =>
      item.implementationId === "technocore-python-official-0.9.1" &&
      item.status === "fail",
  );
  if (officialFailures.length) throw new Error("Official oracle regression");
  const starterPadding = comparison.cases.find(
    (item) =>
      item.implementationId === "zunmax-did-starter-3cc03a6" &&
      item.id === "strict-signature-encoding",
  );
  if (starterPadding?.status !== "fail") {
    throw new Error("Pinned starter strict-encoding finding changed");
  }
  if (comparison.status !== "failed") throw new Error("Failure outcome precedence regression");
  const incomplete = await executeRun({
    suiteId: SUITES[0].id,
    seed: "incomplete-self-test",
    mode: "standard",
    implementationIds: ["technocore-python-official-0.9.1"],
  });
  if (
    incomplete.status !== "incomplete" ||
    incomplete.counts.unsupported !== 1
  ) throw new Error("Unsupported outcome precedence regression");
  const adapterError = await executeRun(
    {
      suiteId: SUITES[0].id,
      seed: "error-self-test",
      mode: "standard",
      implementationIds: [
        "technocore-ts-reference-local",
        "technocore-python-official-0.9.1",
      ],
    },
    {
      runPythonAdapter: async () => {
        throw new Error("/sensitive/path worker failed with private detail");
      },
    },
  );
  const errorCases = adapterError.cases.filter(
    (item) => item.implementationId === "technocore-python-official-0.9.1",
  );
  if (
    adapterError.status !== "error" ||
    adapterError.counts.errors !== 15 ||
    errorCases.some(
      (item) =>
        item.status !== "error" ||
        item.actual !== null ||
        item.evidence[0]?.message !== "Built-in adapter process failed",
    ) ||
    adapterError.summary?.divergences.length !== 0
  ) throw new Error("Adapter execution error regression");
  const passed = await executeRun({
    suiteId: SUITES[0].id,
    seed: "passed-self-test",
    mode: "standard",
  });
  if (passed.status !== "passed") throw new Error("Passed outcome precedence regression");
  const statusXml = [
    runToJUnit(comparison),
    runToJUnit(incomplete),
    runToJUnit(adapterError),
  ].join("");
  if (
    !statusXml.includes("<failure ") ||
    !statusXml.includes("<skipped ") ||
    !statusXml.includes("<error ")
  ) throw new Error("JUnit outcome element regression");
  const reservedBundle = exportBundle(comparison);
  try {
    validateImportedBundle(reservedBundle);
    throw new Error("Reserved built-in import was accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Reserved built-in import was accepted") throw error;
  }
  const externalId = "local-self-test-adapter";
  const externalRun: GauntletRun = {
    ...passed,
    implementationId: externalId,
    implementationIds: [externalId],
    implementations: [{
      id: externalId,
      name: "Local self test",
      language: "Test",
      version: "1.0",
      locality: "local",
      kind: "external",
      status: "imported",
      license: "MIT",
      sourceRevision: "revision-1",
      sourceBasis: [],
      capabilities: ["standard-vector-jsonl"],
      disclaimer: EXTERNAL_EVIDENCE_DISCLAIMER,
      certification: EXTERNAL_EVIDENCE_CERTIFICATION,
    }],
    provenance: { kind: "local" },
    replayOf: null,
    cases: passed.cases.map((item) => ({
      ...item,
      implementationId: externalId,
      actualCanonical: null,
      byteDiff: null,
    })),
  };
  const externalBundle = exportBundle(externalRun);
  const imported = validateImportedBundle(externalBundle);
  if (imported.provenance?.kind !== "import") throw new Error("Import provenance missing");
  if (
    imported.provenance.originalRunId !== externalRun.id ||
    imported.provenance.sourceDigest !== externalBundle.digest
  ) throw new Error("Import source provenance missing");
  if (
    computeRunBundleDigest(imported) !== imported.bundleDigest ||
    exportBundle(imported).digest !== imported.bundleDigest
  ) throw new Error("Imported local digest canonicalization regression");
  const expectImportRejected = (
    label: string,
    mutate: (run: GauntletRun) => void,
  ) => {
    const adversarial = structuredClone(externalBundle);
    mutate(adversarial.run);
    adversarial.run.bundleDigest = computeRunBundleDigest(adversarial.run);
    adversarial.digest = adversarial.run.bundleDigest;
    try {
      validateImportedBundle(adversarial);
    } catch {
      return;
    }
    throw new Error(`Adversarial import accepted: ${label}`);
  };
  expectImportRejected("altered expected", (run) => { run.cases[0].expected = { valid: false }; });
  expectImportRejected("altered expected canonical", (run) => {
    run.cases[0].expectedCanonical = "dishonest bytes";
  });
  expectImportRejected("altered input", (run) => { run.cases[0].input = {}; });
  expectImportRejected("altered metadata", (run) => { run.cases[0].title = "Dishonest title"; });
  expectImportRejected("altered implementation metadata", (run) => {
    run.implementations![0].disclaimer = "Trust this result";
  });
  expectImportRejected("adapter says pass with wrong actual", (run) => {
    run.cases[0].actual = { valid: false };
  });
  expectImportRejected("adapter says fail with matching actual", (run) => {
    run.cases[0].status = "fail";
  });
  expectImportRejected("altered counts", (run) => { run.counts.passed -= 1; });
  expectImportRejected("altered run status", (run) => { run.status = "failed"; });
  expectImportRejected("altered summary", (run) => { run.summary!.supported -= 1; });
  expectImportRejected("unsupported shape abuse", (run) => {
    run.cases[0].status = "unsupported";
    run.cases[0].actual = null;
    run.cases[0].evidence = [{ kind: "unsupported", message: "no", data: {} }];
  });
  expectImportRejected("error shape abuse", (run) => {
    run.cases[0].status = "error";
    run.cases[0].evidence = [{ kind: "adapter-error", message: "no", data: {} }];
  });
  expectImportRejected("untrusted actual canonical", (run) => {
    run.cases[0].actualCanonical = "claimed bytes";
  });
  expectImportRejected("standard case order", (run) => {
    [run.cases[0], run.cases[1]] = [run.cases[1], run.cases[0]];
  });
  const importedReplay = exportBundle(imported);
  try {
    validateImportedBundle(importedReplay);
    throw new Error("Imported evidence replay was accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Imported evidence replay was accepted") throw error;
  }
  resolvePythonWorkerPath();
  resolvePythonWorkerPath(new URL("../../dist/index.mjs", import.meta.url).href);
  comparison.cases[0].id = `unsafe<&"'`;
  const xml = runToJUnit(comparison);
  if (xml.includes(`unsafe<&"'`) || !xml.includes("unsafe&lt;&amp;&quot;&apos;")) {
    throw new Error("JUnit escaping regression");
  }
  process.stdout.write("gauntlet backend self-test passed\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});