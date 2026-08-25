import { randomUUID } from "node:crypto";
import {
  computeRunBundleDigest,
  computeContractDigest,
  computeVectorDigest,
  DEFAULT_CHAOS_CONFIG,
  EXTERNAL_EVIDENCE_CERTIFICATION,
  EXTERNAL_EVIDENCE_DISCLAIMER,
  IMPLEMENTATIONS,
  semanticEqual,
  stableJson,
  standardCases,
  SUITES,
  type GauntletRun,
} from "./gauntlet";
import { canonicalizeRunForDatabase, databaseSafeValue } from "./run-canonical";

export const BUNDLE_FORMAT = "technocore-gauntlet-bundle/v1";
export const ADAPTER_CONTRACT = "technocore-gauntlet-adapter/v1";
const FORBIDDEN_KEY =
  /(^|_)(url|uri|command|cmd|path|executable|binary|source|sourcecode|code|args|argv|environment|env)$/i;
const EXTERNAL_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  location: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown ${location} properties: ${unknown.join(", ")}`);
}

function inspect(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error("Bundle nesting is too deep");
  if (typeof value === "string" && value.length > 16_384) {
    throw new Error("Bundle contains an oversized string");
  }
  if (Array.isArray(value)) {
    for (const item of value) inspect(item, depth + 1);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) throw new Error(`Executable-like field is forbidden: ${key}`);
      inspect(item, depth + 1);
    }
  }
}

export function exportBundle(run: GauntletRun) {
  const implementationIds = run.implementationIds ?? [run.implementationId];
  const canonicalRun: GauntletRun = {
    ...run,
    implementationIds,
    implementations:
      run.implementations ??
      IMPLEMENTATIONS.filter((item) => implementationIds.includes(item.id)),
    contractDigest: run.contractDigest ?? computeContractDigest(),
    vectorDigest: run.vectorDigest ?? computeVectorDigest(),
    counts: {
      ...run.counts,
      unsupported:
        run.counts.unsupported ??
        run.cases.filter((item) => item.status === "unsupported").length,
      errors:
        run.counts.errors ??
        run.cases.filter((item) => item.status === "error").length,
    },
    provenance: run.provenance ?? { kind: "local" },
    cases: run.cases.map((item) => ({
      ...item,
      implementationId: item.implementationId ?? run.implementationId,
    })),
  };
  const databaseSafeRun = canonicalizeRunForDatabase(canonicalRun);
  databaseSafeRun.bundleDigest = computeRunBundleDigest(databaseSafeRun);
  return {
    format: BUNDLE_FORMAT,
    contract: ADAPTER_CONTRACT,
    digest: databaseSafeRun.bundleDigest,
    run: databaseSafeRun,
  };
}

export function validateImportedBundle(value: unknown): GauntletRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Bundle must be a JSON object");
  }
  const bundle = value as Record<string, unknown>;
  exactKeys(bundle, ["format", "contract", "digest", "run"], "bundle");
  if (bundle.format !== BUNDLE_FORMAT || bundle.contract !== ADAPTER_CONTRACT) {
    throw new Error("Unknown bundle format or adapter contract");
  }
  if (!bundle.run || typeof bundle.run !== "object" || Array.isArray(bundle.run)) {
    throw new Error("Bundle run is missing");
  }
  inspect(bundle.run);
  const run = bundle.run as GauntletRun;
  if (typeof bundle.digest !== "string" || bundle.digest !== computeRunBundleDigest(run)) {
    throw new Error("Bundle digest mismatch");
  }
  if (run.bundleDigest !== bundle.digest) throw new Error("Run bundle digest mismatch");
  exactKeys(
    run as unknown as Record<string, unknown>,
    [
      "id", "suiteId", "suiteVersion", "implementationId",
      "implementationIds", "implementations", "contractDigest", "vectorDigest",
      "bundleDigest", "summary", "provenance", "seed", "mode", "config",
      "status", "counts", "startedAt", "finishedAt", "replayOf", "cases",
    ],
    "run",
  );
  if (run.suiteId !== SUITES[0].id || run.suiteVersion !== SUITES[0].version) {
    throw new Error("Unknown suite");
  }
  if (
    run.mode !== "standard" ||
    !semanticEqual(run.config, DEFAULT_CHAOS_CONFIG)
  ) throw new Error("External imports support standard mode only");
  if (run.replayOf !== null || !semanticEqual(run.provenance, { kind: "local" })) {
    throw new Error("Imported evidence must be an original local run");
  }
  if (
    run.contractDigest !== computeContractDigest() ||
    run.vectorDigest !== computeVectorDigest()
  ) throw new Error("Contract or vector digest mismatch");
  if (!Array.isArray(run.implementationIds) || run.implementationIds.length < 1 || run.implementationIds.length > 3) {
    throw new Error("Bundle must name 1 to 3 implementations");
  }
  if (new Set(run.implementationIds).size !== run.implementationIds.length) {
    throw new Error("Duplicate implementation IDs");
  }
  if (
    run.implementationId !== run.implementationIds[0] ||
    !run.implementationIds.includes(run.implementationId)
  ) throw new Error("Primary implementation ID mismatch");
  if (
    !Array.isArray(run.implementations) ||
    run.implementations.length !== run.implementationIds.length
  ) throw new Error("Implementation metadata snapshot mismatch");
  if (
    new Set(run.implementations.map((item) => item?.id)).size !==
      run.implementations.length ||
    run.implementations.some(
      (item, index) => item?.id !== run.implementationIds![index],
    )
  ) throw new Error("Implementation metadata order or uniqueness mismatch");
  for (const snapshot of run.implementations) {
    if (!run.implementationIds.includes(snapshot.id)) {
      throw new Error("Implementation metadata ID mismatch");
    }
    if (IMPLEMENTATIONS.some((item) => item.id === snapshot.id)) {
      throw new Error("Reserved built-in results cannot be imported as external evidence");
    }
    exactKeys(
      snapshot as unknown as Record<string, unknown>,
      [
        "id", "name", "language", "version", "locality", "kind", "status",
        "license", "sourceRevision", "sourceBasis", "capabilities",
        "disclaimer", "certification",
      ],
      "external implementation",
    );
    const strings = [
      snapshot.name, snapshot.language, snapshot.version, snapshot.license,
      snapshot.sourceRevision, snapshot.disclaimer, snapshot.certification,
    ];
    if (
      !EXTERNAL_ID.test(snapshot.id) ||
      snapshot.kind !== "external" ||
      snapshot.status !== "imported" ||
      snapshot.locality !== "local" ||
      snapshot.disclaimer !== EXTERNAL_EVIDENCE_DISCLAIMER ||
      snapshot.certification !== EXTERNAL_EVIDENCE_CERTIFICATION ||
      strings.some((item) => typeof item !== "string" || item.length < 1 || item.length > 200) ||
      strings.some((item) => /:\/\/|[\\/]|(?:^|\s)(?:command|executable|source\s*code)(?:\s|$)/i.test(item)) ||
      !Array.isArray(snapshot.sourceBasis) ||
      snapshot.sourceBasis.length !== 0 ||
      !Array.isArray(snapshot.capabilities) ||
      snapshot.capabilities.length < 1 ||
      snapshot.capabilities.length > 12 ||
      snapshot.capabilities.some(
        (item) =>
          typeof item !== "string" ||
          item.length < 1 ||
          item.length > 60 ||
          !/^[a-z0-9][a-z0-9._-]*$/.test(item),
      )
    ) throw new Error("Invalid external implementation metadata");
  }
  if (!Array.isArray(run.cases) || run.cases.length > 100) {
    throw new Error("Bundle may contain at most 100 cases");
  }
  const templates = databaseSafeValue(standardCases(run.seed)) as GauntletRun["cases"];
  if (run.cases.length !== templates.length * run.implementationIds.length) {
    throw new Error("Bundle vector coverage mismatch");
  }
  const derivedCases: GauntletRun["cases"] = [];
  for (let caseIndex = 0; caseIndex < run.cases.length; caseIndex += 1) {
    const item = run.cases[caseIndex];
    const implementationIndex = Math.floor(caseIndex / templates.length);
    const template = templates[caseIndex % templates.length];
    const expectedImplementationId = run.implementationIds[implementationIndex];
    if (!item || typeof item !== "object") throw new Error("Invalid standard case");
    exactKeys(
      item as unknown as Record<string, unknown>,
      [
        "id", "title", "category", "severity", "status", "implementationId",
        "input", "expected", "actual", "expectedCanonical", "actualCanonical",
        "byteDiff", "durationMs", "citation", "evidence",
      ],
      "case",
    );
    if (!["pass", "fail", "unsupported", "error"].includes(item.status)) {
      throw new Error("Bundle contains an invalid case status");
    }
    if (!Object.hasOwn(item, "actual")) throw new Error("Bundle case actual is missing");
    if (
      item.implementationId !== expectedImplementationId ||
      item.id !== template.id
    ) {
      throw new Error("Bundle standard case order or coverage mismatch");
    }
    for (const key of [
      "id", "title", "category", "severity", "input", "expected",
      "expectedCanonical", "citation",
    ] as const) {
      if (!semanticEqual(item[key], template[key])) {
        throw new Error(`Bundle standard case ${key} mismatch`);
      }
    }
    if (
      !Number.isFinite(item.durationMs) ||
      item.durationMs < 0 ||
      item.durationMs > 60_000 ||
      !Array.isArray(item.evidence) ||
      item.evidence.length > 16 ||
      JSON.stringify(item.evidence).length > 32_768 ||
      item.evidence.some(
        (entry) =>
          !entry ||
          typeof entry.kind !== "string" ||
          entry.kind.length < 1 ||
          entry.kind.length > 60 ||
          typeof entry.message !== "string" ||
          entry.message.length < 1 ||
          entry.message.length > 500 ||
          !entry.data ||
          typeof entry.data !== "object" ||
          Array.isArray(entry.data),
      )
    ) throw new Error("Invalid or oversized case evidence");
    for (const entry of item.evidence) {
      exactKeys(
        entry as unknown as Record<string, unknown>,
        ["kind", "message", "data"],
        "case evidence",
      );
    }
    let derivedStatus: GauntletRun["cases"][number]["status"];
    if (item.status === "unsupported") {
      if (
        !semanticEqual(item.actual, { unsupported: true }) ||
        item.evidence.length < 1 ||
        item.evidence[0].kind !== "unsupported"
      ) throw new Error("Invalid unsupported case evidence");
      derivedStatus = "unsupported";
    } else if (item.status === "error") {
      if (
        item.actual !== null ||
        item.evidence.length < 1 ||
        item.evidence[0].kind !== "adapter-error"
      ) throw new Error("Invalid error case evidence");
      derivedStatus = "error";
    } else {
      derivedStatus = semanticEqual(template.expected, item.actual) ? "pass" : "fail";
      if (item.status !== derivedStatus) {
        throw new Error("Claimed pass/fail disagrees with supplied actual");
      }
    }
    if (item.actualCanonical !== null || item.byteDiff !== null) {
      throw new Error("Untrusted external canonical-byte claims are not accepted");
    }
    derivedCases.push({
      ...item,
      title: template.title,
      category: template.category,
      severity: template.severity,
      input: template.input,
      expected: template.expected,
      expectedCanonical: template.expectedCanonical,
      actualCanonical: null,
      byteDiff: null,
      citation: template.citation,
      status: derivedStatus,
    });
  }
  const passed = derivedCases.filter((item) => item.status === "pass").length;
  const failed = derivedCases.filter((item) => item.status === "fail").length;
  const unsupported = derivedCases.filter((item) => item.status === "unsupported").length;
  const errors = derivedCases.filter((item) => item.status === "error").length;
  const derivedCounts = {
    total: derivedCases.length, passed, failed, unsupported, errors,
  };
  if (!semanticEqual(run.counts, derivedCounts)) throw new Error("Bundle count mismatch");
  const divergences = templates.map((item) => item.id).filter((vectorId) => {
    const comparable = derivedCases.filter(
      (item) =>
        item.id === vectorId &&
        (item.status === "pass" || item.status === "fail"),
    );
    return (
      comparable.length > 1 &&
      new Set(comparable.map((item) => stableJson(item.actual))).size > 1
    );
  });
  const expectedStatus: GauntletRun["status"] =
    errors > 0
      ? "error"
      : failed > 0 || divergences.length > 0
        ? "failed"
        : unsupported > 0
          ? "incomplete"
          : "passed";
  if (run.status !== expectedStatus) {
    throw new Error("Bundle status mismatch");
  }
  const supported = derivedCases.length - unsupported - errors;
  const derivedSummary = {
    supported,
    unsupported,
    coveragePercent:
      derivedCases.length === 0 ? 100 : (supported / derivedCases.length) * 100,
    agreement: Math.max(0, templates.length - divergences.length),
    divergences,
  };
  if (!semanticEqual(run.summary, derivedSummary)) throw new Error("Bundle summary mismatch");
  const originalRunId = run.id;
  const sourceDigest = bundle.digest;
  const imported: GauntletRun = {
    ...run,
    id: randomUUID(),
    replayOf: null,
    provenance: {
      kind: "import",
      importedAt: new Date().toISOString(),
      originalRunId,
      sourceDigest,
    },
    counts: derivedCounts,
    status: expectedStatus,
    summary: derivedSummary,
    cases: derivedCases,
  };
  const canonicalImported = canonicalizeRunForDatabase(imported);
  canonicalImported.bundleDigest = computeRunBundleDigest(canonicalImported);
  return canonicalImported;
}

function xml(value: unknown): string {
  const safe = Array.from(String(value), (character) => {
    const code = character.codePointAt(0)!;
    return code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
      ? character
      : "\ufffd";
  }).join("");
  return safe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function runToJUnit(run: GauntletRun): string {
  const failures = run.cases.filter((item) => item.status === "fail").length;
  const skipped = run.cases.filter((item) => item.status === "unsupported").length;
  const errors = run.cases.filter((item) => item.status === "error").length;
  const cases = run.cases.map((item) => {
    const name = `${item.implementationId ?? run.implementationId}:${item.id}`;
    const body =
      item.status === "fail"
        ? `<failure message="conformance failure">${xml(JSON.stringify({ expected: item.expected, actual: item.actual }))}</failure>`
        : item.status === "unsupported"
          ? `<skipped message="${xml(item.evidence[0]?.message ?? "unsupported")}"/>`
          : item.status === "error"
            ? `<error message="${xml(item.evidence[0]?.message ?? "adapter error")}"/>`
          : "";
    return `<testcase classname="${xml(run.suiteId)}" name="${xml(name)}" time="${Math.max(0, item.durationMs / 1000).toFixed(6)}">${body}</testcase>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xml(run.suiteId)}" tests="${run.cases.length}" failures="${failures}" errors="${errors}" skipped="${skipped}">${cases}</testsuite>\n`;
}