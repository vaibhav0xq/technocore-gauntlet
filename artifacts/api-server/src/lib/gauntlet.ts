import { createHash, randomUUID } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  b58encode,
  canonicalMessagePayload,
  decodeSignature,
  didToPublicKey,
  publicKeyToDid,
} from "./didkey";
import { sweepText } from "./normalize";
import { runPythonAdapter } from "./python-adapters";
import { canonicalizeRunForDatabase } from "./run-canonical";

export const SUITE_VERSION = "0.9.1";
export const IMPLEMENTATION_ID = "technocore-ts-reference-local";
export const EXTERNAL_EVIDENCE_DISCLAIMER =
  "Self-reported local evidence; structurally validated but not authenticated or endorsed.";
export const EXTERNAL_EVIDENCE_CERTIFICATION =
  "Not certified: the server did not execute or authenticate this external adapter.";

export const DEFAULT_CHAOS_CONFIG = {
  unicodeInsertions: 0,
  truncations: 0,
  duplicates: 0,
  reorderings: 0,
  latencyMs: 0,
  jitterMs: 0,
  nonceBoundary: false,
} as const;

export type ChaosConfig = {
  unicodeInsertions: number;
  truncations: number;
  duplicates: number;
  reorderings: number;
  latencyMs: number;
  jitterMs: number;
  nonceBoundary: boolean;
};

export type VerifierInput = {
  did: string;
  room: string;
  nonce: string;
  text: string;
  signature: string;
};

export type VerifierResult = {
  valid: boolean;
  canonicalPayload: string;
  sweptText: string;
  payloadUtf8Hex: string;
  publicKeyHex: string | null;
  signatureHex: string | null;
  diagnostics: string[];
};

export type GauntletCase = {
  id: string;
  title: string;
  category: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "pass" | "fail" | "unsupported" | "error";
  implementationId?: string;
  input: Record<string, unknown>;
  expected: unknown;
  actual: unknown;
  expectedCanonical: string | null;
  actualCanonical: string | null;
  byteDiff: {
    firstMismatch: number;
    expectedUtf8Hex: string;
    actualUtf8Hex: string;
  } | null;
  durationMs: number;
  citation: string;
  evidence: Array<{
    kind: string;
    message: string;
    data: Record<string, unknown>;
  }>;
};

export type GauntletRun = {
  id: string;
  suiteId: string;
  suiteVersion: string;
  implementationId: string;
  implementationIds?: string[];
  implementations?: ImplementationMetadata[];
  contractDigest?: string;
  vectorDigest?: string;
  bundleDigest?: string;
  summary?: {
    supported: number;
    unsupported: number;
    coveragePercent: number;
    agreement: number;
    divergences: string[];
  };
  provenance?: {
    kind: "local" | "import";
    importedAt?: string;
    originalRunId?: string;
    sourceDigest?: string;
  };
  seed: string;
  mode: "standard" | "chaos";
  config: ChaosConfig;
  status: "passed" | "failed" | "incomplete" | "error";
  counts: {
    total: number;
    passed: number;
    failed: number;
    unsupported?: number;
    errors?: number;
  };
  startedAt: string;
  finishedAt: string;
  replayOf: string | null;
  cases: GauntletCase[];
};

export type ImplementationMetadata = {
  id: string;
  name: string;
  language: string;
  version: string;
  locality: "local";
  kind: "reference" | "official-oracle" | "community" | "external";
  status: "built-in" | "imported";
  license: string;
  sourceRevision: string;
  sourceBasis: string[];
  capabilities: string[];
  disclaimer: string;
  certification: string;
};

type VectorDefinition = {
  id: string;
  version: string;
  title: string;
  category: string;
  severity: GauntletCase["severity"];
  description: string;
  citation: string;
  input: Record<string, unknown>;
  expected: unknown;
};

const definitions = [
  ["valid-ed25519", "Valid Ed25519 signature", "signature", "critical", "A deterministic Ed25519 signature verifies.", "tests/http/test_signer.py", { mutation: "none" }, { valid: true }],
  ["strict-signature-encoding", "Reject padded signature", "encoding", "high", "Only canonical 86-character unpadded base64url is accepted.", "tests/http/test_signer.py", { mutation: "padding" }, { valid: false }],
  ["tampered-text", "Reject tampered text", "signature", "critical", "Changing text invalidates the signature.", "tests/http/test_signer.py", { mutation: "text" }, { valid: false }],
  ["tampered-room", "Reject tampered room", "signature", "critical", "Room is bound into the payload.", "docs/design.md §6.5", { mutation: "room" }, { valid: false }],
  ["tampered-nonce", "Reject tampered nonce", "signature", "critical", "Nonce is bound into the payload.", "docs/design.md §6.5", { mutation: "nonce" }, { valid: false }],
  ["malformed-did", "Reject malformed DID", "did", "high", "The did:key grammar is strict.", "src/didkey.py", { did: "did:web:example.test" }, { valid: false }],
  ["malformed-multibase", "Reject malformed multibase", "did", "high", "Non-base58btc multibase data is rejected.", "src/didkey.py", { mutation: "multibase" }, { valid: false }],
  ["small-order-key", "Reject small-order key", "signature", "critical", "Strict RFC 8032 verification rejects noncanonical/small-order points.", "src/didkey.py", { mutation: "small-order" }, { valid: false }],
  ["canonical-payload", "Canonical payload bytes", "canonicalization", "critical", "Payload is room|nonce|swept-text encoded as UTF-8.", "docs/design.md §6.5", { room: "lab", nonce: "7" }, { canonical: "lab|7|hello" }],
  ["unicode-sweep", "Sweep Cc/Cf/Cs/Co/Zl/Zp", "canonicalization", "high", "All protocol sweep categories become spaces.", "src/message.py", { categories: ["Cc", "Cf", "Cs", "Co", "Zl", "Zp"] }, { swept: "a b c d e f g" }],
  ["sweep-idempotence", "Sweep is idempotent", "canonicalization", "medium", "Sweeping a swept string has no further effect.", "src/message.py", { property: "f(f(x))=f(x)" }, { valid: true }],
  ["nonce-one-digit", "Accept one-digit nonce", "nonce", "high", "The lower nonce width boundary is accepted.", "tests/http/test_signer.py", { nonce: "1" }, { valid: true }],
  ["nonce-nineteen-digits", "Accept 19-digit nonce above 2^53", "nonce", "critical", "Nonces remain decimal strings without JS number coercion.", "tests/http/test_signer.py", { nonce: "9007199254740993001" }, { valid: true }],
  ["nonce-twenty-digits", "Reject 20-digit nonce", "nonce", "critical", "The upper nonce width boundary is enforced.", "tests/http/test_signer.py", { nonce: "10000000000000000000" }, { valid: false }],
  ["single-use-replay", "Local single-use replay semantics", "replay", "high", "The same locally observed signature is accepted once then rejected.", "docs/design.md §6.5", { attempts: 2 }, { accepted: [true, false] }],
] as const;

export const VECTORS: VectorDefinition[] = definitions.map(
  ([id, title, category, severity, description, citation, input, expected]) => ({
    id,
    version: SUITE_VERSION,
    title,
    category,
    severity,
    description,
    citation,
    input,
    expected,
  }),
);

export const SUITES = [
  {
    id: "protocol-v0.9.1",
    version: SUITE_VERSION,
    title: "Technocore v0.9.1 protocol conformance",
    description:
      "Pure local deterministic canonicalization, did:key, Ed25519, nonce and replay checks.",
    vectorIds: VECTORS.map((vector) => vector.id),
    modes: ["standard", "chaos"] as const,
  },
];

export const PROTOCOL = {
  name: "Technocore signed room message protocol",
  version: SUITE_VERSION,
  canonicalPayload: "<room>|<decimal nonce string>|<swept text>",
  signatureEncoding: "exactly 86 characters, unpadded base64url, 64 decoded bytes",
  nonceRule: "ASCII decimal string of 1 through 19 digits; never a number",
  sweepCategories: ["Cc", "Cf", "Cs", "Co", "Zl", "Zp"],
  sourceBasis: ["src/didkey.py", "tests/http/test_signer.py", "docs/design.md §6.5"],
  safety: {
    executionClass: "pure-local" as const,
    pureLocal: [
      "In-code fixtures and deterministic generated keys only",
      "No DNS, HTTP, sockets, remote targets or public writes",
      "Bounded synchronous execution and persisted local evidence",
    ],
    optionalLiveSmoke: {
      implemented: false,
      readOnly: true,
      description:
        "A future explicitly enabled smoke mode may perform a bounded read-only check; this MVP never executes it.",
    },
    forbidden: [
      "Mutations to technocore.chat or any public target",
      "Public posting, signing requests, account actions or state changes",
      "Load, soak, fuzz, amplification or unbounded tests against any network",
    ],
  },
};

export const IMPLEMENTATIONS = [
  {
    id: IMPLEMENTATION_ID,
    name: "Local TypeScript reference adapter",
    language: "TypeScript",
    version: SUITE_VERSION,
    locality: "local" as const,
    kind: "reference" as const,
    status: "built-in" as const,
    license: "Project license",
    sourceRevision: "local-workspace",
    capabilities: ["standard", "chaos", "strict-didkey", "canonicalization", "replay"],
    sourceBasis: PROTOCOL.sourceBasis,
    certification:
      "Derived from the official v0.9.1 source/tests; this is not an official certification or endorsement.",
    disclaimer: "Unofficial community conformance adapter; no certification or endorsement is implied.",
  },
  {
    id: "technocore-python-official-0.9.1",
    name: "Official Python v0.9.1 protocol oracle",
    language: "Python",
    version: "0.9.1",
    locality: "local" as const,
    kind: "official-oracle" as const,
    status: "built-in" as const,
    license: "Apache-2.0",
    sourceRevision: "v0.9.1",
    sourceBasis: ["vendor/technocore-adapters/official-v0.9.1"],
    capabilities: ["standard", "strict-didkey", "canonicalization"],
    certification: "Executes vendored protocol-only extracts from the official v0.9.1 implementation.",
    disclaimer: "Gauntlet and this packaging are unofficial; oracle results are not certification or endorsement.",
  },
  {
    id: "zunmax-did-starter-3cc03a6",
    name: "zunmax DID starter pinned adapter",
    language: "Python",
    version: "3cc03a6",
    locality: "local" as const,
    kind: "community" as const,
    status: "built-in" as const,
    license: "MIT",
    sourceRevision: "3cc03a6e908e8776de9fdd465c53d23d31db2e9f",
    sourceBasis: ["vendor/technocore-adapters/community-3cc03a6"],
    capabilities: ["standard", "normalize", "message-payload", "did", "sign", "verify", "nonce"],
    certification: "Executes only the pinned starter's pure protocol seams; its posting workflow is excluded.",
    disclaimer: "Unofficial community adapter; not affiliated with or endorsed by Flop Labs.",
  },
] satisfies ImplementationMetadata[];

function utf8Hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

export function verifyLocally(input: VerifierInput): VerifierResult {
  const sweptText = sweepText(input.text);
  const canonicalPayload = canonicalMessagePayload(
    input.room,
    input.nonce,
    input.text,
  );
  const diagnostics: string[] = [];
  let publicKey: Uint8Array | null = null;
  let signature: Uint8Array | null = null;
  if (!/^[0-9]{1,19}$/.test(input.nonce)) {
    diagnostics.push("nonce must contain 1 to 19 ASCII decimal digits");
  }
  try {
    publicKey = didToPublicKey(input.did);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }
  try {
    signature = decodeSignature(input.signature);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }
  let valid = false;
  if (diagnostics.length === 0 && publicKey && signature) {
    try {
      valid = ed25519.verify(
        signature,
        new TextEncoder().encode(canonicalPayload),
        publicKey,
        { zip215: false },
      );
      if (!valid) diagnostics.push("signature does not match canonical payload");
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    valid,
    canonicalPayload,
    sweptText,
    payloadUtf8Hex: utf8Hex(canonicalPayload),
    publicKeyHex: publicKey ? Buffer.from(publicKey).toString("hex") : null,
    signatureHex: signature ? Buffer.from(signature).toString("hex") : null,
    diagnostics,
  };
}

function seededIdentity(seed: string) {
  const privateKey = createHash("sha256")
    .update(`technocore-gauntlet:${seed}`, "utf8")
    .digest();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, did: publicKeyToDid(publicKey) };
}

function sign(
  privateKey: Uint8Array,
  room: string,
  nonce: string,
  text: string,
): string {
  return Buffer.from(
    ed25519.sign(
      new TextEncoder().encode(canonicalMessagePayload(room, nonce, text)),
      privateKey,
    ),
  ).toString("base64url");
}

function diff(expected: string | null, actual: string | null) {
  if (expected === null || actual === null || expected === actual) return null;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  let firstMismatch = 0;
  while (
    firstMismatch < left.length &&
    firstMismatch < right.length &&
    left[firstMismatch] === right[firstMismatch]
  ) {
    firstMismatch += 1;
  }
  return {
    firstMismatch,
    expectedUtf8Hex: left.toString("hex"),
    actualUtf8Hex: right.toString("hex"),
  };
}

function resultCase(
  vector: VectorDefinition,
  input: Record<string, unknown>,
  expected: unknown,
  actual: unknown,
  expectedCanonical: string | null = null,
  actualCanonical: string | null = null,
  evidence: GauntletCase["evidence"] = [],
): GauntletCase {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  return {
    id: vector.id,
    title: vector.title,
    category: vector.category,
    severity: vector.severity,
    status: pass ? "pass" : "fail",
    input,
    expected,
    actual,
    expectedCanonical,
    actualCanonical,
    byteDiff: diff(expectedCanonical, actualCanonical),
    durationMs: 0,
    citation: vector.citation,
    evidence,
  };
}

function deterministicInt(seed: string, label: string, max: number): number {
  const digest = createHash("sha256").update(`${seed}:${label}`).digest();
  return digest.readUInt32BE(0) % max;
}

export function standardCases(seed: string): GauntletCase[] {
  const { privateKey, did } = seededIdentity(seed);
  const room = "gauntlet";
  const nonce = "9007199254740993001";
  const text = "hello";
  const signature = sign(privateKey, room, nonce, text);
  const base: VerifierInput = { did, room, nonce, text, signature };
  const byId = (id: string) => VECTORS.find((v) => v.id === id)!;
  const check = (
    id: string,
    changed: Partial<VerifierInput>,
    expectedValid: boolean,
  ) => {
    const input = { ...base, ...changed };
    const verified = verifyLocally(input);
    return resultCase(
      byId(id),
      input,
      { valid: expectedValid },
      { valid: verified.valid },
      expectedValid ? canonicalMessagePayload(input.room, input.nonce, input.text) : null,
      verified.canonicalPayload,
      verified.diagnostics.map((message) => ({
        kind: "diagnostic",
        message,
        data: {},
      })),
    );
  };

  const categories = `a\u0000b\u200bc\ud800d\ue000e\u2028f\u2029g`;
  const canonical = canonicalMessagePayload("lab", "7", "hello");
  const replaySeen = new Set<string>();
  const replayResults = [signature, signature].map((value) => {
    if (replaySeen.has(value)) return false;
    replaySeen.add(value);
    return true;
  });
  const zeroKey = new Uint8Array(34);
  zeroKey[0] = 0xed;
  zeroKey[1] = 0x01;
  const smallOrderDid = `did:key:z${b58encode(zeroKey)}`;
  const twentySignature = sign(privateKey, room, "10000000000000000000", text);

  return [
    check("valid-ed25519", {}, true),
    check("strict-signature-encoding", { signature: `${signature}==` }, false),
    check("tampered-text", { text: "hello!" }, false),
    check("tampered-room", { room: "other" }, false),
    check("tampered-nonce", { nonce: "9007199254740993002" }, false),
    check("malformed-did", { did: "did:web:example.test" }, false),
    check("malformed-multibase", { did: `${did.slice(0, -1)}0` }, false),
    check("small-order-key", { did: smallOrderDid }, false),
    resultCase(byId("canonical-payload"), { room: "lab", nonce: "7", text: "hello" }, { canonical }, { canonical }, canonical, canonical),
    resultCase(byId("unicode-sweep"), { text: categories }, { swept: "a b c d e f g" }, { swept: sweepText(categories) }),
    resultCase(byId("sweep-idempotence"), { text: categories }, { valid: true }, { valid: sweepText(sweepText(categories)) === sweepText(categories) }),
    check("nonce-one-digit", { nonce: "1", signature: sign(privateKey, room, "1", text) }, true),
    check("nonce-nineteen-digits", {}, true),
    check("nonce-twenty-digits", { nonce: "10000000000000000000", signature: twentySignature }, false),
    resultCase(byId("single-use-replay"), { signature, attempts: 2 }, { accepted: [true, false] }, { accepted: replayResults }),
  ];
}

function chaosCases(seed: string, config: ChaosConfig): GauntletCase[] {
  const { privateKey, did } = seededIdentity(seed);
  const room = "chaos";
  const nonce = "19";
  const text = "deterministic chaos payload";
  const signature = sign(privateKey, room, nonce, text);
  const out: GauntletCase[] = [];
  const addMutation = (
    kind: string,
    count: number,
    mutate: (index: number) => string,
  ) => {
    for (let index = 0; index < count; index += 1) {
      const mutated = mutate(index);
      const verified = verifyLocally({ did, room, nonce, text: mutated, signature });
      const vector: VectorDefinition = {
        id: `chaos-${kind}-${index + 1}`,
        version: SUITE_VERSION,
        title: `${kind} mutation ${index + 1}`,
        category: "chaos",
        severity: "medium",
        description: "Bounded deterministic local mutation",
        citation: "docs/design.md §6.5",
        input: { kind, index },
        expected: { valid: false },
      };
      out.push(resultCase(
        vector,
        { kind, original: text, mutated },
        { valid: false },
        { valid: verified.valid },
        null,
        verified.canonicalPayload,
        [{ kind: "mutation", message: "Deterministically derived local mutation", data: { index } }],
      ));
    }
  };
  addMutation("unicode-insertion", config.unicodeInsertions, (index) => {
    const position = deterministicInt(seed, `unicode:${index}`, text.length + 1);
    return `${text.slice(0, position)}\u200b${text.slice(position)}`;
  });
  addMutation("truncation", config.truncations, (index) =>
    text.slice(0, Math.max(1, text.length - index - 1)),
  );
  addMutation("duplication", config.duplicates, (index) => {
    const position = deterministicInt(seed, `duplicate:${index}`, text.length);
    return `${text.slice(0, position)}${text[position]}${text.slice(position)}`;
  });
  addMutation("reordering", config.reorderings, (index) => {
    const position = deterministicInt(seed, `reorder:${index}`, text.length - 1);
    return `${text.slice(0, position)}${text[position + 1]}${text[position]}${text.slice(position + 2)}`;
  });
  if (config.latencyMs > 0 || config.jitterMs > 0) {
    const jitter =
      config.jitterMs === 0
        ? 0
        : deterministicInt(seed, "jitter", config.jitterMs * 2 + 1) -
          config.jitterMs;
    const recordedMs = Math.max(0, config.latencyMs + jitter);
    const vector: VectorDefinition = {
      id: "chaos-latency-record",
      version: SUITE_VERSION,
      title: "Recorded deterministic latency/jitter",
      category: "chaos",
      severity: "info",
      description: "Evidence only; no sleep and no network operation.",
      citation: "docs/design.md §6.5",
      input: {},
      expected: { recorded: true },
    };
    out.push(resultCase(vector, { latencyMs: config.latencyMs, jitterMs: config.jitterMs }, { recorded: true }, { recorded: true }, null, null, [{
      kind: "timing",
      message: "Timing was recorded only; execution did not sleep.",
      data: { recordedMs, jitter },
    }]));
  }
  if (config.nonceBoundary) {
    for (const boundary of ["1", "9007199254740993001", "10000000000000000000"]) {
      const boundarySignature = sign(privateKey, room, boundary, text);
      const valid = verifyLocally({ did, room, nonce: boundary, text, signature: boundarySignature }).valid;
      const expectedValid = boundary.length <= 19;
      const vector: VectorDefinition = {
        id: `chaos-nonce-${boundary.length}-${boundary}`,
        version: SUITE_VERSION,
        title: `Nonce boundary (${boundary.length} digits)`,
        category: "chaos",
        severity: "high",
        description: "Deterministic nonce boundary derivation.",
        citation: "tests/http/test_signer.py",
        input: { nonce: boundary },
        expected: { valid: expectedValid },
      };
      out.push(resultCase(vector, { nonce: boundary }, { valid: expectedValid }, { valid }));
    }
  }
  return out;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function computeContractDigest(): string {
  return sha256({
    contract: "technocore-gauntlet-adapter/v1",
    suite: SUITE_VERSION,
  });
}

export function computeVectorDigest(): string {
  return sha256(VECTORS);
}

export function computeRunBundleDigest(run: GauntletRun): string {
  const { bundleDigest: _ignored, ...content } = run;
  return sha256({ format: "technocore-gauntlet-bundle/v1", run: content });
}

export async function executeRun(input: {
  suiteId: string;
  seed: string;
  mode: "standard" | "chaos";
  config?: Partial<ChaosConfig>;
  replayOf?: string | null;
  implementationIds?: string[];
}, dependencies: {
  runPythonAdapter: typeof runPythonAdapter;
} = { runPythonAdapter }): Promise<GauntletRun> {
  if (input.suiteId !== SUITES[0].id) {
    throw new Error(`Unknown suite: ${input.suiteId}`);
  }
  const config: ChaosConfig = { ...DEFAULT_CHAOS_CONFIG, ...input.config };
  const selected = input.implementationIds ?? [IMPLEMENTATION_ID];
  if (selected.length < 1 || selected.length > 3 || new Set(selected).size !== selected.length) {
    throw new Error("implementationIds must contain 1 to 3 unique allowlisted adapters");
  }
  const snapshots = selected.map((id) => {
    const implementation = IMPLEMENTATIONS.find((item) => item.id === id);
    if (!implementation) throw new Error(`Unknown implementation: ${id}`);
    return implementation;
  });
  const startedAt = new Date();
  const referenceStandard = standardCases(input.seed);
  const referenceChaos = input.mode === "chaos" ? chaosCases(input.seed, config) : [];
  if ((referenceStandard.length + referenceChaos.length) * selected.length > 100) {
    throw new Error("Selected implementations and chaos configuration exceed the 100-case cap");
  }
  const cases: GauntletCase[] = [];
  for (const implementationId of selected) {
    if (implementationId === IMPLEMENTATION_ID) {
      cases.push(
        ...[...referenceStandard, ...referenceChaos].map((item) => ({
          ...item,
          implementationId,
        })),
      );
      continue;
    }
    try {
      const results = await dependencies.runPythonAdapter(implementationId, input.seed);
      const byId = new Map(results.map((item) => [item.id, item]));
      if (
        byId.size !== results.length ||
        results.length !== referenceStandard.length ||
        results.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            !referenceStandard.some((baseline) => baseline.id === item.id) ||
            !("actual" in item) ||
            !("actualCanonical" in item),
        )
      ) throw new Error("adapter returned a malformed vector set");
      for (const baseline of referenceStandard) {
        const result = byId.get(baseline.id);
        if (!result) throw new Error("adapter omitted a required vector");
        const unsupported = result.unsupported;
        cases.push({
          ...baseline,
          implementationId,
          actual: unsupported ? { unsupported: true } : result.actual,
          actualCanonical: result.actualCanonical,
          byteDiff: diff(baseline.expectedCanonical, result.actualCanonical),
          status: unsupported
            ? "unsupported"
            : JSON.stringify(baseline.expected) === JSON.stringify(result.actual)
              ? "pass"
              : "fail",
          evidence: unsupported
            ? [{ kind: "unsupported", message: unsupported.slice(0, 500), data: {} }]
            : [{
                kind: "adapter",
                message: "Bounded result returned by the built-in Python adapter",
                data: { implementationId },
              }],
        });
      }
      for (const baseline of referenceChaos) {
        cases.push({
          ...baseline,
          implementationId,
          status: "unsupported",
          actual: { unsupported: true },
          actualCanonical: null,
          byteDiff: null,
          evidence: [{
            kind: "unsupported",
            message: "Chaos execution is TypeScript-only",
            data: {},
          }],
        });
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const reason = /timed out/i.test(raw)
        ? "Built-in adapter timed out"
        : /output exceeded/i.test(raw)
          ? "Built-in adapter output limit exceeded"
          : /failed/i.test(raw)
            ? "Built-in adapter process failed"
            : "Built-in adapter returned an invalid result";
      cases.push(
        ...[...referenceStandard, ...referenceChaos].map((baseline) => ({
          ...baseline,
          implementationId,
          status: "error" as const,
          actual: null,
          actualCanonical: null,
          byteDiff: null,
          evidence: [{
            kind: "adapter-error",
            message: reason,
            data: {},
          }],
        })),
      );
    }
  }
  const finishedAt = new Date();
  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.filter((item) => item.status === "fail").length;
  const unsupported = cases.filter((item) => item.status === "unsupported").length;
  const errors = cases.filter((item) => item.status === "error").length;
  const divergenceIds: string[] = [];
  for (const vector of [...referenceStandard, ...referenceChaos]) {
    const supported = cases.filter(
      (item) =>
        item.id === vector.id &&
        (item.status === "pass" || item.status === "fail"),
    );
    if (
      supported.length > 1 &&
      new Set(supported.map((item) => stableJson(item.actual))).size > 1
    ) divergenceIds.push(vector.id);
  }
  const supported = cases.length - unsupported - errors;
  const status: GauntletRun["status"] =
    errors > 0
      ? "error"
      : failed > 0 || divergenceIds.length > 0
        ? "failed"
        : unsupported > 0
          ? "incomplete"
          : "passed";
  const run: GauntletRun = {
    id: randomUUID(),
    suiteId: input.suiteId,
    suiteVersion: SUITE_VERSION,
    implementationId: selected[0],
    implementationIds: selected,
    implementations: snapshots,
    contractDigest: computeContractDigest(),
    vectorDigest: computeVectorDigest(),
    seed: input.seed,
    mode: input.mode,
    config,
    status,
    counts: { total: cases.length, passed, failed, unsupported, errors },
    summary: {
      supported,
      unsupported,
      coveragePercent: cases.length === 0 ? 100 : (supported / cases.length) * 100,
      agreement: Math.max(0, referenceStandard.length + referenceChaos.length - divergenceIds.length),
      divergences: divergenceIds,
    },
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    replayOf: input.replayOf ?? null,
    provenance: { kind: "local" },
    cases,
  };
  const canonicalRun = canonicalizeRunForDatabase(run);
  canonicalRun.bundleDigest = computeRunBundleDigest(canonicalRun);
  return canonicalRun;
}

export async function runGauntletSelfTest(): Promise<{
  passed: boolean;
  failures: string[];
}> {
  const first = await executeRun({
    suiteId: SUITES[0].id,
    seed: "self-test",
    mode: "standard",
  });
  const second = await executeRun({
    suiteId: SUITES[0].id,
    seed: "self-test",
    mode: "standard",
  });
  const failures = first.cases
    .filter((item) => item.status === "fail")
    .map((item) => item.id);
  if (JSON.stringify(first.cases) !== JSON.stringify(second.cases)) {
    failures.push("deterministic-replay");
  }
  return { passed: failures.length === 0, failures };
}