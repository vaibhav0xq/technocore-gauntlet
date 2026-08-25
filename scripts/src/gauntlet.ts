import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const FORMAT = "technocore-gauntlet-bundle/v1";
const CONTRACT = "technocore-gauntlet-adapter/v1";
const MAX_BYTES = 256 * 1024;
const EXTERNAL_EVIDENCE_DISCLAIMER =
  "Self-reported local evidence; structurally validated but not authenticated or endorsed.";
const EXTERNAL_EVIDENCE_CERTIFICATION =
  "Not certified: the server did not execute or authenticate this external adapter.";
const RESERVED_IMPLEMENTATIONS = new Set([
  "technocore-ts-reference-local",
  "technocore-python-official-0.9.1",
  "zunmax-did-starter-3cc03a6",
]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type BundleCase = {
  id: string;
  implementationId?: string;
  status: "pass" | "fail" | "unsupported" | "error";
  input: Json;
  expected: Json;
  actual: Json;
  expectedCanonical?: string | null;
  actualCanonical?: string | null;
  byteDiff?: Json;
  durationMs: number;
  evidence: Array<{ kind?: string; message: string; data?: Record<string, Json> }>;
};
type Bundle = {
  format: string;
  contract: string;
  digest: string;
  run: {
    implementationId: string;
    implementationIds?: string[];
    suiteId: string;
    counts: { total: number; passed: number; failed: number; unsupported?: number; errors?: number };
    status: "passed" | "failed" | "incomplete" | "error";
    cases: BundleCase[];
    bundleDigest?: string;
    [key: string]: Json | undefined;
  };
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(run: Bundle["run"]): string {
  const { bundleDigest: _ignored, ...content } = run;
  return createHash("sha256")
    .update(stable({ format: FORMAT, run: content }))
    .digest("hex");
}

function equal(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function recompute(bundle: Bundle): void {
  const cases = bundle.run.cases;
  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.filter((item) => item.status === "fail").length;
  const errors = cases.filter((item) => item.status === "error").length;
  const unsupported = cases.filter((item) => item.status === "unsupported").length;
  const vectorIds = [...new Set(cases.map((item) => item.id))];
  const divergences = vectorIds.filter((vectorId) => {
    const comparable = cases.filter(
      (item) =>
        item.id === vectorId &&
        (item.status === "pass" || item.status === "fail"),
    );
    return comparable.length > 1 &&
      new Set(comparable.map((item) => stable(item.actual))).size > 1;
  });
  const supported = cases.length - unsupported - errors;
  bundle.run.counts = {
    total: cases.length,
    passed,
    failed,
    unsupported,
    errors,
  };
  bundle.run.status = errors > 0
    ? "error"
    : failed > 0 || divergences.length > 0
      ? "failed"
      : unsupported > 0
        ? "incomplete"
        : "passed";
  bundle.run.summary = {
    supported,
    unsupported,
    coveragePercent: cases.length === 0 ? 100 : (supported / cases.length) * 100,
    agreement: Math.max(0, vectorIds.length - divergences.length),
    divergences,
  };
  bundle.run.bundleDigest = digest(bundle.run);
  bundle.digest = bundle.run.bundleDigest;
}

function validate(value: unknown): Bundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bundle must be an object");
  const bundle = value as Bundle;
  if (bundle.format !== FORMAT || bundle.contract !== CONTRACT) throw new Error("unknown bundle format/contract");
  if (!bundle.run || !Array.isArray(bundle.run.cases) || bundle.run.cases.length > 100) throw new Error("invalid case list");
  if ((bundle.run.implementationIds?.length ?? 1) > 3) throw new Error("too many implementations");
  const selected = bundle.run.implementationIds ?? [bundle.run.implementationId];
  if (
    selected.length < 1 ||
    new Set(selected).size !== selected.length ||
    bundle.run.implementationId !== selected[0] ||
    !Array.isArray(bundle.run.implementations) ||
    bundle.run.implementations.length !== selected.length ||
    bundle.run.implementations.some(
      (item, index) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        item.id !== selected[index],
    )
  ) throw new Error("implementation identity mismatch");
  const keys = new Set<string>();
  for (const item of bundle.run.cases) {
    if (!["pass", "fail", "unsupported", "error"].includes(item.status)) throw new Error("invalid status");
    if (!item.implementationId || !selected.includes(item.implementationId)) {
      throw new Error("case implementation mismatch");
    }
    const key = `${item.implementationId}\0${item.id}`;
    if (keys.has(key)) throw new Error("duplicate case");
    keys.add(key);
  }
  const passed = bundle.run.cases.filter((item) => item.status === "pass").length;
  const failed = bundle.run.cases.filter((item) => item.status === "fail").length;
  const unsupported = bundle.run.cases.filter((item) => item.status === "unsupported").length;
  const errors = bundle.run.cases.filter((item) => item.status === "error").length;
  if (
    bundle.run.counts.total !== bundle.run.cases.length ||
    bundle.run.counts.passed !== passed ||
    bundle.run.counts.failed !== failed ||
    (bundle.run.counts.unsupported ?? unsupported) !== unsupported ||
    bundle.run.counts.errors !== errors
  ) throw new Error("count mismatch");
  const vectorIds = new Set(bundle.run.cases.map((item) => item.id));
  if (keys.size !== vectorIds.size * selected.length) throw new Error("vector coverage mismatch");
  for (const implementationId of selected) {
    for (const vectorId of vectorIds) {
      if (!keys.has(`${implementationId}\0${vectorId}`)) throw new Error("missing vector");
    }
  }
  const divergences = [...vectorIds].filter((vectorId) => {
    const comparable = bundle.run.cases.filter(
      (item) =>
        item.id === vectorId &&
        (item.status === "pass" || item.status === "fail"),
    );
    return comparable.length > 1 &&
      new Set(comparable.map((item) => stable(item.actual))).size > 1;
  });
  const expectedStatus = errors > 0
    ? "error"
    : failed > 0 || divergences.length > 0
      ? "failed"
      : unsupported > 0
        ? "incomplete"
        : "passed";
  if (bundle.run.status !== expectedStatus) {
    throw new Error("status mismatch");
  }
  if (bundle.digest !== digest(bundle.run)) throw new Error("digest mismatch");
  return bundle;
}

function escapeXml(value: unknown): string {
  const safe = Array.from(String(value), (character) => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff) ? character : "\ufffd";
  }).join("");
  return safe.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function junit(bundle: Bundle): string {
  const cases = bundle.run.cases.map((item) => {
    const name = `${item.implementationId ?? bundle.run.implementationId}:${item.id}`;
    const body = item.status === "fail"
      ? `<failure message="conformance failure">${escapeXml(JSON.stringify({ expected: item.expected, actual: item.actual }))}</failure>`
      : item.status === "unsupported"
        ? `<skipped message="${escapeXml(item.evidence[0]?.message ?? "unsupported")}"/>`
        : item.status === "error"
          ? `<error message="${escapeXml(item.evidence[0]?.message ?? "adapter error")}"/>`
        : "";
    return `<testcase classname="${escapeXml(bundle.run.suiteId)}" name="${escapeXml(name)}" time="${Math.max(0, item.durationMs / 1000).toFixed(6)}">${body}</testcase>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${escapeXml(bundle.run.suiteId)}" tests="${bundle.run.cases.length}" failures="${bundle.run.counts.failed}" errors="${bundle.run.counts.errors ?? 0}" skipped="${bundle.run.counts.unsupported ?? 0}">${cases}</testsuite>\n`;
}

function applyAdapterResult(
  item: BundleCase,
  result: {
    vectorId: string;
    status: BundleCase["status"];
    actual?: Json;
    message?: string;
  },
): void {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some((key) => !["vectorId", "status", "actual", "message"].includes(key)) ||
    result.vectorId !== item.id ||
    !["pass", "fail", "unsupported", "error"].includes(result.status)
  ) throw new Error("invalid adapter JSONL result");
  const message = result.message;
  if (message !== undefined && (typeof message !== "string" || message.length < 1 || message.length > 500)) {
    throw new Error("adapter message must contain 1 to 500 characters");
  }
  if (result.status === "unsupported") {
    if (!equal(result.actual, { unsupported: true })) {
      throw new Error("unsupported adapter result must use actual {unsupported:true}");
    }
    item.status = "unsupported";
    item.actual = { unsupported: true };
    item.evidence = [{
      kind: "unsupported",
      message: message ?? "External adapter explicitly reported this vector unsupported",
      data: {},
    }];
  } else if (result.status === "error") {
    if (result.actual !== null) throw new Error("error adapter result must use actual null");
    item.status = "error";
    item.actual = null;
    item.evidence = [{
      kind: "adapter-error",
      message: message ?? "External adapter explicitly reported a bounded local error",
      data: {},
    }];
  } else {
    if (!Object.hasOwn(result, "actual")) throw new Error("adapter result is missing actual");
    const derived = equal(item.expected, result.actual) ? "pass" : "fail";
    if (result.status !== derived) {
      throw new Error(`adapter claimed ${result.status} for ${item.id}, derived ${derived}`);
    }
    item.status = derived;
    item.actual = result.actual as Json;
    item.evidence = [{
      kind: "adapter",
      message: "Self-reported result returned by the operator-run local adapter",
      data: {},
    }];
  }
  item.actualCanonical = null;
  item.byteDiff = null;
  item.durationMs = 0;
}

async function localAdapter(executable: string, bundle: Bundle): Promise<void> {
  const requests = bundle.run.cases.map((item) => JSON.stringify({
    contract: CONTRACT,
    implementationId: item.implementationId ?? bundle.run.implementationId,
    vectorId: item.id,
    input: item.input,
    expected: item.expected,
  })).join("\n") + "\n";
  if (Buffer.byteLength(requests) > MAX_BYTES) throw new Error("adapter stdin exceeds 256 KiB");
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, [], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("local adapter timed out"));
    }, 5_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        child.kill("SIGKILL");
        reject(new Error("adapter stdout exceeds 256 KiB"));
      } else chunks.push(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`adapter exited ${code}`));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(requests);
  });
  const lines = output.trim().split("\n");
  if (lines.length !== bundle.run.cases.length) throw new Error("adapter result count mismatch");
  lines.forEach((line, index) => {
    const result = JSON.parse(line) as {
      vectorId: string;
      status: BundleCase["status"];
      actual?: Json;
      message?: string;
    };
    const item = bundle.run.cases[index];
    applyAdapterResult(item, result);
  });
  recompute(bundle);
}

function attributeExternal(
  bundle: Bundle,
  metadata: {
    id: string;
    name: string;
    language: string;
    version: string;
    license: string;
    revision: string;
  },
): void {
  if (
    RESERVED_IMPLEMENTATIONS.has(metadata.id) ||
    !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(metadata.id)
  ) throw new Error("--implementation-id must be a non-reserved lowercase local ID");
  for (const [key, value] of Object.entries(metadata)) {
    if (
      value.length < 1 ||
      value.length > 200 ||
      /:\/\/|[\\/]|(?:^|\s)(?:command|executable|source\s*code)(?:\s|$)/i.test(value)
    ) throw new Error(`invalid external attribution: ${key}`);
  }
  const unique = new Map<string, BundleCase>();
  for (const item of bundle.run.cases) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  bundle.run.cases = [...unique.values()].map((item) => ({
    ...item,
    implementationId: metadata.id,
    actualCanonical: null,
    byteDiff: null,
  }));
  bundle.run.implementationId = metadata.id;
  bundle.run.implementationIds = [metadata.id];
  bundle.run.implementations = [{
    id: metadata.id,
    name: metadata.name,
    language: metadata.language,
    version: metadata.version,
    locality: "local",
    kind: "external",
    status: "imported",
    license: metadata.license,
    sourceRevision: metadata.revision,
    sourceBasis: [],
    capabilities: ["standard-vector-jsonl"],
    disclaimer: EXTERNAL_EVIDENCE_DISCLAIMER,
    certification: EXTERNAL_EVIDENCE_CERTIFICATION,
  }];
  bundle.run.provenance = { kind: "local" };
  delete bundle.run.bundleDigest;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    const unsafe = escapeXml(`x<&"'`);
    if (unsafe !== "x&lt;&amp;&quot;&apos;") throw new Error("XML escaping self-test failed");
    const run = {
      implementationId: "technocore-ts-reference-local",
      implementationIds: ["technocore-ts-reference-local"],
      implementations: [{ id: "technocore-ts-reference-local" }],
      suiteId: "s",
      counts: { total: 4, passed: 1, failed: 1, unsupported: 1, errors: 1 },
      status: "error" as const,
      summary: { divergences: [] },
      cases: (["pass", "fail", "unsupported", "error"] as const).map(
        (status, index) => ({
          id: `vector-${index}`,
          implementationId: "technocore-ts-reference-local",
          status,
          input: {},
          expected: {},
          actual: status === "error" ? null : {},
          durationMs: 0,
          evidence: [{ message: status }],
        }),
      ),
    };
    const bundle: Bundle = {
      format: FORMAT,
      contract: CONTRACT,
      digest: digest(run),
      run,
    };
    validate(bundle);
    const selfTestXml = junit(bundle);
    if (
      !selfTestXml.includes("<failure ") ||
      !selfTestXml.includes("<skipped ") ||
      !selfTestXml.includes("<error ")
    ) throw new Error("JUnit status self-test failed");
    attributeExternal(bundle, {
      id: "self-test-external",
      name: "Self test",
      language: "Test",
      version: "1.0",
      license: "MIT",
      revision: "revision-1",
    });
    recompute(bundle);
    validate(bundle);
    if (
      bundle.run.implementationId !== "self-test-external" ||
      !bundle.run.summary
    ) throw new Error("external attribution self-test failed");
    const dishonestResults: Array<{
      vectorId: string;
      status: BundleCase["status"];
      actual: Json;
    }> = [
      { vectorId: "vector-0", status: "pass" as const, actual: { wrong: true } },
      { vectorId: "vector-0", status: "fail" as const, actual: {} },
    ];
    for (const dishonest of dishonestResults) {
      try {
        applyAdapterResult(structuredClone(bundle.run.cases[0]), dishonest);
        throw new Error("dishonest pass/fail adapter result was accepted");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "dishonest pass/fail adapter result was accepted"
        ) throw error;
      }
    }
    for (const abusive of [
      { vectorId: "vector-0", status: "unsupported" as const, actual: null },
      { vectorId: "vector-0", status: "error" as const, actual: {} },
    ]) {
      try {
        applyAdapterResult(structuredClone(bundle.run.cases[0]), abusive);
        throw new Error("invalid unsupported/error adapter result was accepted");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "invalid unsupported/error adapter result was accepted"
        ) throw error;
      }
    }
    process.stdout.write("gauntlet CLI self-test passed\n");
    return;
  }
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const input = option("--input");
  if (!input) throw new Error("--input is required");
  const raw = await readFile(input);
  if (raw.length > MAX_BYTES) throw new Error("bundle exceeds 256 KiB");
  const bundle = validate(JSON.parse(raw.toString("utf8")));
  const adapter = option("--adapter");
  if (adapter) {
    if (bundle.run.mode !== "standard") {
      throw new Error("external local adapters support standard mode only");
    }
    const required = {
      id: option("--implementation-id"),
      name: option("--name"),
      language: option("--language"),
      version: option("--version"),
      license: option("--license"),
      revision: option("--revision"),
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => `--${key === "id" ? "implementation-id" : key}`);
    if (missing.length) throw new Error(`local adapter attribution is required: ${missing.join(", ")}`);
    attributeExternal(bundle, required as Record<keyof typeof required, string>);
    await localAdapter(adapter, bundle);
  }
  const jsonPath = option("--json");
  const junitPath = option("--junit");
  if (jsonPath) await writeFile(jsonPath, JSON.stringify(bundle, null, 2) + "\n");
  if (junitPath) await writeFile(junitPath, junit(bundle));
  if (!jsonPath && !junitPath) process.stdout.write(JSON.stringify(bundle, null, 2) + "\n");
  const summary =
    bundle.run.summary && typeof bundle.run.summary === "object" && !Array.isArray(bundle.run.summary)
      ? bundle.run.summary
      : undefined;
  const divergent = Array.isArray(summary?.divergences) && summary.divergences.length > 0;
  if ((bundle.run.counts.errors ?? 0) > 0 || bundle.run.counts.failed > 0 || divergent) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`gauntlet: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});