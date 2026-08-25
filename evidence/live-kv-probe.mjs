#!/usr/bin/env node
// Live documented-versus-actual probe for Technocore conditional note writes.
//
// The offline suite in this repository never touches the network. This script is
// the opposite lane and is therefore opt-in, bounded and namespaced: it compares
// what technocore.chat documents about conditional writes against what the live
// service actually does.
//
//   node evidence/live-kv-probe.mjs                 # prints the plan, writes nothing
//   node evidence/live-kv-probe.mjs --run           # generates a namespace and runs
//   node evidence/live-kv-probe.mjs --namespace <ns> --run
//
// Ownership cannot be proved over this protocol: notes are world-writable and an
// empty namespace is not an owned one. So the probe does not claim ownership. It
// generates a random namespace by default, refuses reserved names, fails closed
// on any preflight it cannot read, and takes the key with the protocol's own
// if_absent primitive, which aborts the run if anything already holds it. That
// closes the gap between checking and writing; passing --namespace hands the
// judgement back to you.
//
// Requires Node 18 or newer (global fetch). No install, no database.

import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const FORMAT = "technocore-gauntlet-live-probe/v1";
const KEY = "probe";
const MAX_REQUESTS = 48;
const SPACING_MS = 1000;
const TIMEOUT_MS = 25000;
const NAME_GRAMMAR = /^[a-z0-9][a-z0-9_-]{0,47}$/;

// Namespaces the service reserves, or that belong to other agents by convention.
const RESERVED_PREFIXES = ["did-", "did", "topic", "room-owners", "room-allow", "room-nonce", "mb-"];

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? null : argv[at + 1] ?? null;
};
const base = (process.env.TECHNOCORE_BASE ?? "https://technocore.chat").replace(/\/+$/, "");
const outPath = flag("--out");
const live = argv.includes("--run");
const namespace = flag("--namespace") ?? `gauntlet-probe-${randomBytes(5).toString("hex")}`;

if (!NAME_GRAMMAR.test(namespace)) fail(`Namespace ${JSON.stringify(namespace)} does not match the protocol grammar /^[a-z0-9][a-z0-9_-]{0,47}$/.`);
if (RESERVED_PREFIXES.some((p) => namespace === p || namespace.startsWith(p))) {
  fail(`Namespace ${JSON.stringify(namespace)} is reserved or conventionally owned by another agent.`);
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
function parseNote(text) {
  const lines = text.split("\n").filter((line) => line.trim() && !line.startsWith("!!"));
  return lines.length ? lines[lines.length - 1].trim() : "";
}

async function readValue() {
  const { status, text } = await call("GET", noteUrl);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`Read of ${namespace}/${KEY} returned ${status}; aborting rather than guessing at the stored value.`);
  return parseNote(text);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// documented: what technocore.chat's reference and /openapi.json promise.
// undocumented: a near miss a caller can plausibly make. There is no promise to
// break, so the only question is whether it fails closed or silently writes.
// Each step writes a value distinct from the one the probe last wrote, so its
// own effective writes show up as transitions. That is an observation about
// before and after values, not a proof of causation: a concurrent writer in the
// same namespace could still produce a transition, or mask one by writing the
// same value this step was about to write.
const plan = [
  { id: "claim-if-absent", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/base?if_absent=1`, expectStatus: 200, expectWrite: true, note: "if_absent=1 against a key that does not exist. This is also how the probe takes the key." },
  { id: "get-if-stale", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/a?if=WRONG`, expectStatus: 409, expectWrite: false, note: "GET /kv/<ns>/<key>/set/<value>?if=<what you last read>" },
  { id: "post-body-if-stale", lane: "POST", contract: "documented", url: () => noteUrl, body: { value: "b", if: "WRONG" }, expectStatus: 409, expectWrite: false, note: 'POST /kv/<ns>/<key> {"value":.., "if":..}' },
  { id: "get-if-current", lane: "GET", contract: "documented", url: (current) => `${noteUrl}/set/c?if=${encodeURIComponent(current)}`, expectStatus: 200, expectWrite: true, note: "A matching if= wins the CAS." },
  { id: "get-if-absent-on-existing", lane: "GET", contract: "documented", url: () => `${noteUrl}/set/d?if_absent=1`, expectStatus: 409, expectWrite: false, note: "if_absent=1 against a key that exists." },
  { id: "post-body-if-absent-on-existing", lane: "POST", contract: "documented", url: () => noteUrl, body: { value: "e", if_absent: true }, expectStatus: 409, expectWrite: false, note: 'POST /kv/<ns>/<key> {"value":.., "if_absent":true} against a key that exists.' },
  { id: "post-if-in-query", lane: "POST", contract: "undocumented", url: () => `${noteUrl}?if=WRONG`, body: { value: "f" }, note: "Query form carried onto the POST lane, where the condition belongs in the body." },
  { id: "get-if-misspelled", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/g?iff=WRONG`, note: "Misspelled conditional parameter." },
  { id: "get-if-wrong-case", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/h?IF=WRONG`, note: "Conditional parameter in the wrong case." },
  { id: "get-if-empty", lane: "GET", contract: "undocumented", url: () => `${noteUrl}/set/i?if=`, note: "Empty expected value." },
  { id: "post-if-absent-wrong-type", lane: "POST", contract: "undocumented", url: () => noteUrl, body: { value: "j", if_absent: "yes" }, note: "if_absent as a string rather than a boolean." },
];

if (!live) {
  console.log(`Plan against ${base} (dry run, nothing is written).\n`);
  for (const step of plan) {
    console.log(`  ${step.lane.padEnd(4)} ${step.url("<current>")}${step.body ? `  body ${JSON.stringify(step.body)}` : ""}`);
    console.log(`       ${step.contract}: ${step.note}`);
  }
  console.log(`\n${plan.length} writes plus read-backs, capped at ${MAX_REQUESTS} requests, ${SPACING_MS}ms apart.`);
  console.log("Re-run with --run to execute. A random namespace is generated unless you pass --namespace.");
  process.exit(0);
}

// Preflight fails closed: anything other than a definitive "nothing is here"
// aborts, because an unreadable namespace is not an empty one.
const listed = await call("GET", `${base}/kv/${namespace}`);
if (listed.status === 200) {
  if (listed.text.split("\n").some((line) => line.trim() && !line.startsWith("!!"))) {
    fail(`Namespace ${namespace} already holds keys. This probe does not write into a namespace in use.`);
  }
} else if (listed.status !== 404) {
  fail(`Listing ${namespace} returned ${listed.status}. Failing closed rather than assuming it is empty.`);
}

const cases = [];
for (const step of plan) {
  await sleep(SPACING_MS);
  const before = await readValue();
  const { status, text } = await call(step.body ? "POST" : "GET", step.url(before ?? ""), step.body);

  // The first step doubles as an atomic claim: 409 means something already
  // holds the key, so stop before writing anything.
  if (step.id === "claim-if-absent" && status !== 200) {
    fail(`Could not take ${namespace}/${KEY} with if_absent=1 (HTTP ${status}). Something else holds it; nothing was written.`);
  }

  await sleep(SPACING_MS);
  const after = await readValue();
  const changed = before !== after;

  let verdict;
  if (step.contract === "documented") {
    verdict = status === step.expectStatus && changed === step.expectWrite ? "documented-match" : "documented-divergence";
  } else {
    verdict = changed ? "undocumented-fails-open" : "undocumented-fails-closed";
  }

  cases.push({
    id: step.id,
    lane: step.lane,
    contract: step.contract,
    request: { method: step.body ? "POST" : "GET", url: step.url(before ?? "").replace(base, ""), body: step.body ?? null },
    documented: step.note,
    expected: step.contract === "documented" ? { status: step.expectStatus, valueChanges: step.expectWrite } : null,
    observed: { status, valueChanged: changed, valueBefore: before, valueAfter: after, responseFirstLine: text.split("\n")[0].slice(0, 160) },
    verdict,
  });
  console.log(`${verdict.padEnd(26)} ${step.id.padEnd(32)} HTTP ${status}  ${before} -> ${after}`);
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
  method: "Each step reads the note, issues one write, then reads it again, and writes a value distinct from the one the probe last wrote. What is recorded is an observed before and after value, not proof that the request caused the difference. Notes are world-writable, so a concurrent writer in this namespace could produce a transition, or mask one by writing the same value the step was about to write. The namespace is random and the key is taken with if_absent=1, which makes that unlikely rather than impossible.",
  cases,
  summary,
  digest: "",
};
bundle.digest = createHash("sha256").update(stable({ ...bundle, digest: undefined })).digest("hex");

console.log(`\ndocumented cases checked: ${summary.documentedChecked}, divergences: ${summary.documentedDivergences.length ? summary.documentedDivergences.join(", ") : "none"}`);
console.log(`undocumented near misses that silently wrote: ${summary.failsOpen.length ? summary.failsOpen.join(", ") : "none"}`);
console.log(`undocumented near misses that failed closed: ${summary.failsClosed.length ? summary.failsClosed.join(", ") : "none"}`);
console.log(`requests used: ${requests} of ${MAX_REQUESTS}`);
console.log(`digest ${bundle.digest.slice(0, 24)}`);

if (outPath) {
  await writeFile(outPath, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

process.exit(summary.documentedDivergences.length ? 1 : 0);
