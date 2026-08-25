# Gauntlet adapter contract

The built-in adapter contract is `technocore-gauntlet-adapter/v1`. Adapters are
pure protocol functions: they receive JSON data and return bounded JSON data.
They must not perform DNS, HTTP, socket, subprocess, file-write, account, or
posting operations.

## Server-owned Python adapters

The API server accepts only the three IDs published by `/implementations`.
Python IDs execute via a fixed `python3` command and the fixed
`vendor/technocore-adapters/adapter_worker.py` path. The process uses
`shell:false`, a five-second timeout, 64 KiB stdin, and 128 KiB stdout. Requests
cannot select an executable, path, argument, URL, source text, or environment.
The worker reads one JSON document from stdin:

```json
{"contract":"technocore-gauntlet-adapter/v1","implementationId":"technocore-python-official-0.9.1","seed":"example"}
```

It returns one bounded JSON object with `contract` and `cases`. The official
extract invokes the v0.9.1 `clean_text` categories and strict PyNaCl verifier.
The starter extract invokes only pinned `normalize`, `message_payload`, `DID`,
`sign`, `verify`, and nonce seams. No starter network/posting code is vendored.

Every requested implementation/vector pair produces one case. Case outcomes
are `pass`, `fail`, `unsupported`, or `error`; run outcomes are `passed`,
`failed`, `incomplete`, or `error`. Adapter process failures become bounded,
non-sensitive per-vector error evidence and are persisted. Outcome precedence
is error, then conformance failure/true divergence, then incomplete coverage,
then fully passed.

## Local CLI command / JSONL

Arbitrary executables are supported **only** by the operator-run local CLI:

```text
pnpm --filter @workspace/scripts gauntlet -- --input run.json \
  --adapter /absolute/local/executable \
  --implementation-id my-local-adapter --name "My adapter" \
  --language Rust --version 1.2.3 --license MIT --revision abc123 \
  --json result.json --junit result.xml
```

The executable is spawned directly with `shell:false`, no arguments, bounded
stdin/stdout, and a five-second timeout. Stdin is JSONL, one object per case:
`contract`, `implementationId`, `vectorId`, `input`, and `expected`. It must
return exactly one JSONL object per request, in order, containing `vectorId`,
`status` (`pass`, `fail`, `unsupported`, or `error`), and `actual`; an optional
bounded `message` is allowed. For claimed pass/fail, the CLI derives the outcome
by semantic deep equality of the server-owned expected value and returned
`actual`, and aborts if the claim disagrees. Unsupported must use
`actual: {"unsupported":true}`; error must use `actual: null`. The CLI supplies
bounded evidence, clears untrusted canonical-byte/diff claims, and recomputes
counts, status, comparison summary, and digest. External adapters support
standard mode only; chaos remains TypeScript-only.

All six attribution flags are mandatory. Built-in IDs are reserved. The CLI
uses the downloaded bundle only as a vector template, rewrites every case to a
single `external`/`imported` local implementation snapshot with fixed warnings
that the evidence is self-reported, structurally validated, and neither
authenticated nor certified. It recomputes comparison summary data and the
digest. This local escape hatch is
not exposed by the API and its output is still subject to bundle validation
before server import.

## Bundles

Canonical bundles use `technocore-gauntlet-bundle/v1`, include the adapter
contract, a SHA-256 digest over canonical key-sorted JSON, implementation
metadata snapshots, exact case evidence, and count/coverage summaries. Imports
are data-only: unknown suites, vectors, adapters, contracts, duplicate cases,
count or digest mismatches, executable-like fields, oversized content, and
more than three implementations or 100 cases are rejected.

Imports are exclusively for self-reported external standard-mode results with
`locality: local`, `kind: external`, and `status: imported`. Every reserved
built-in ID or snapshot is rejected: hosted built-in exports are downloadable
evidence, but cannot be re-imported as proof. External metadata has strict
shape, string, capability, license, and revision limits and cannot carry URL,
path, command, executable, environment, or source-code fields. Its disclaimer
and non-certification text are immutable.

The server first checks the self-supplied source digest for transport integrity.
It then regenerates all standard templates for the exact seed and requires
exactly-once order and exact `id`, title, category, severity, input, expected,
expected-canonical, and citation fields. Claimed pass/fail is independently
derived from expected versus actual. Unsupported/error are retained only with
their exact null/value and bounded evidence semantics. Canonical-byte/diff
claims from this contract must be null. Counts, run status, summary,
divergences, and digest must match the independently derived result; dishonest
claims are rejected rather than repaired. Import provenance itself cannot be
imported again or replayed by the hosted runner. Persistence
assigns a new local run ID and records both the original run ID and source
bundle digest in import provenance before computing the new local digest.