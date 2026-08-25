#!/usr/bin/env node
// Live documented-versus-actual probe for Technocore conditional note writes.
//
// The offline suite in this repository never touches the network. This script is
// the opposite lane and is therefore opt-in, bounded and namespaced: it compares
// what technocore.chat documents about conditional writes against what the live
// service actually does.
//
//   node evidence/live-kv-probe.mjs --namespace gauntlet-probe-<random>
//   node evidence/live-kv-probe.mjs --namespace gauntlet-probe-<random> --run
//
// Without --run it prints the exact request plan and writes nothing. With --run
// it refuses any namespace that is reserved, that already holds keys, or whose
// probe key already exists, so it can only ever write to storage it created.
//
// Requires Node 18 or newer (global fetch). No install, no database.

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const FORMAT = "technocore-gauntlet-live-probe/v1";
const KEY = "probe";
const MAX_REQUESTS = 32;
const SPACING_MS = 1000;
const TIMEOUT_MS = 25000;
const NAME_GRAMMAR = /^[a-z0-9][a-z0-9_-]{0,47}$/;

// Namespaces the service reserves, or that belong to other agents by convention.
const RESERVED_PREFIXES = ["did-", "did", "topic", "room-owners", "room-allow", "room-nonce", "mb-"];

function usage(message) {
  const suggestion = `gauntlet-probe-${Math.random().toString(16).slice(2, 10)}`;
  console.error(`${message}\n`);
  console.error("usage: node evidence/live-kv-probe.mjs --namespace <ns-you-own> [--run] [--out <file>]");
  console.error(`\nPick a fresh namespace you own, for example: --namespace ${suggestion}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? null : argv[at + 1] ?? null;
};
const base = (process.env.TECHNOCORE_BASE ?? "https://technocore.chat").replace(/\/+$/, "");
const namespace = flag("--namespace");
const outPath = flag("--out");
const live = argv.includes("--run");

if (!namespace) usage("A --namespace is required.");
if (!NAME_GRAMMAR.test(namespace)) usage(`Namespace ${JSON.stringify(namespace)} does not match the protocol grammar /^[a-z0-9][a-z0-9_-]{0,47}$/.`);
if (RESERVED_PREFIXES.some((p) => namespace === p || namespace.startsWith(p))) {
  usage(`Namespace ${JSON.stringify(namespace)} is reserved or conventionally owned by another agent. This probe only writes to storage it created.`);
}

const noteUrl = `${base}/kv/${namespace}/${KEY}`;
let requests = 0;

async function call(method, url, body) {
  if (requests >= MAX_REQUESTS) throw new Error(`Request cap of ${MAX_REQUESTS} reached; refusing to continue.`);
  requests += 1;
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (response.status === 429) throw new Error("The service rate-limited this probe (429). Wait and re-run; a partial matrix would be misleading.");
  return { status: response.status, text };
}

// A note read is a banner line, a blank line, then the stored value.
async function readValue() {
  const { status, text } = await call("GET", noteUrl);
  if (status === 404) return null;
  const lines = text.split("\n").filter((line) => line.trim() && !line.startsWith("!!"));
  return lines.length ? lines[lines.length - 1].trim() : "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// documented: what technocore.chat's reference and /openapi.json promise.
// undocumented: a near miss a caller can plausibly make. There is no promise to
// break, so the only question is whether it fails closed or silently writes.
const plan = [
  { id: "seed", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/base`, expectStatus: 200, expectWrite: true, note: "Unconditional write establishes a known value." },
  { id: "get-if-stale", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/a?if=WRONG`, expectStatus: 409, expectWrite: false, note: "GET /kv/<ns>/<key>/set/<value>?if=<what you last read>" },
  { id: "post-body-if-stale", lane: "POST", contract: "documented", url: () => noteUrl, body: { value: "b", if: "WRONG" }, expectStatus: 409, expectWrite: false, note: 'POST /kv/<ns>/<key> {"value":.., "if":..}' },
  { id: "get-if-current", lane: "GET", contract: "documented", url: (current) => `${noteUrl}/set/c?if=${encodeURIComponent(current)}`, expectStatus: 200, expectWrite: true, note: "A matching if= wins the CAS." },
  { id: "get-if-absent-on-existing", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/d?if_absent=1`, expectStatus: 409, expectWrite: false, note: "if_absent=1 against a key that exists." },
  { id: "post-if-in-query", lane: "POST", contract: "undocumented", url: () => `${noteUrl}?if=WRONG`, body: { value: "e" }, note: "Query form carried onto the POST lane, where the condition belongs in the body." },
  { id: "get-if-misspelled", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/f?iff=WRONG`, note: "Misspelled conditional parameter." },
  { id: "get-if-wrong-case", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/g?IF=WRONG`, note: "Conditional parameter in the wrong case." },
  { id: "get-if-empty", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/h?if=`, note: "Empty expected value." },
  { id: "post-if-absent-wrong-type", lane: "POST", contract: "undocumented", url: () => noteUrl, body: { value: "i", if_absent: "yes" }, note: "if_absent as a string rather than a boolean." },
];

if (!live) {
  console.log(`Plan against ${base} (dry run, nothing is written).\n`);
  for (const step of plan) {
    const shown = step.url("<current>");
    console.log(`  ${step.lane.padEnd(4)} ${shown}${step.body ? `  body ${JSON.stringify(step.body)}` : ""}`);
    console.log(`       ${step.contract}: ${step.note}`);
  }
  console.log(`\n${plan.length} writes plus read-backs, capped at ${MAX_REQUESTS} requests, ${SPACING_MS}ms apart.`);
  console.log("Re-run with --run to execute against a namespace you own.");
  process.exit(0);
}

// Preconditions: only ever write to storage this probe created.
const existingKeys = await call("GET", `${base}/kv/${namespace}`);
if (existingKeys.status === 200 && existingKeys.text.split("\n").some((l) => l.trim() && !l.startsWith("!!"))) {
  console.error(`Namespace ${namespace} already holds keys. Choose a fresh one; this probe never writes over existing data.`);
  process.exit(2);
}
if ((await readValue()) !== null) {
  console.error(`${namespace}/${KEY} already exists. Choose a fresh namespace.`);
  process.exit(2);
}

const cases = [];
for (const step of plan) {
  await sleep(SPACING_MS);
  const before = await readValue();
  const { status, text } = await call(step.body ? "POST" : "GET", step.url(before ?? ""), step.body);
  await sleep(SPACING_MS);
  const after = await readValue();
  const wrote = before !== after;

  let verdict;
  if (step.contract === "documented") {
    const ok = status === step.expectStatus && wrote === step.expectWrite;
    verdict = ok ? "documented-match" : "documented-divergence";
  } else {
    verdict = wrote ? "undocumented-fails-open" : "undocumented-fails-closed";
  }

  cases.push({
    id: step.id,
    lane: step.lane,
    contract: step.contract,
    request: { method: step.body ? "POST" : "GET", url: step.url(before ?? "").replace(base, ""), body: step.body ?? null },
    documented: step.note,
    expected: step.contract === "documented" ? { status: step.expectStatus, writes: step.expectWrite } : null,
    actual: { status, writes: wrote, valueBefore: before, valueAfter: after, responseFirstLine: text.split("\n")[0].slice(0, 160) },
    verdict,
  });
  console.log(`${verdict.padEnd(26)} ${step.id.padEnd(26)} HTTP ${status}  ${before} -> ${after}`);
}

const summary = {
  documentedChecked: cases.filter((c) => c.contract === "documented").length,
  documentedDivergences: cases.filter((c) => c.verdict === "documented-divergence").map((c) => c.id),
  failsOpen: cases.filter((c) => c.verdict === "undocumented-fails-open").map((c) => c.id),
  failsClosed: cases.filter((c) => c.verdict === "undocumented-fails-closed").map((c) => c.id),
};

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const bundle = {
  format: FORMAT,
  target: base,
  namespace,
  key: KEY,
  observedAt: new Date().toISOString(),
  documentationSource: [`${base}/ (CONDITIONAL NOTES section)`, `${base}/openapi.json`],
  method: "Each step reads the note, issues one write, then reads it again. A write is counted only when the stored value changed.",
  cases,
  summary,
  digest: "",
};
bundle.digest = createHash("sha256").update(stable({ ...bundle, digest: undefined })).digest("hex");

console.log(`\ndocumented cases checked: ${summary.documentedChecked}, divergences: ${summary.documentedDivergences.length || "none"}`);
console.log(`undocumented near misses that silently wrote: ${summary.failsOpen.length ? summary.failsOpen.join(", ") : "none"}`);
console.log(`undocumented near misses that failed closed: ${summary.failsClosed.length ? summary.failsClosed.join(", ") : "none"}`);
console.log(`digest ${bundle.digest.slice(0, 24)}`);

if (outPath) {
  await writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

process.exit(summary.documentedDivergences.length ? 1 : 0);
