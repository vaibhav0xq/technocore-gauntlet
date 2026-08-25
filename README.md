<div align="center">

# Technocore Gauntlet

**A deterministic protocol-conformance and bounded chaos-testing lab for
Technocore implementations.**

[![License: MIT](https://img.shields.io/badge/License-MIT-111827.svg)](LICENSE)
![Protocol](https://img.shields.io/badge/Technocore-v0.9.1-5b5bd6.svg)
![Node](https://img.shields.io/badge/Node.js-24-339933.svg)
![Python](https://img.shields.io/badge/Python-3.12-3776ab.svg)

**[Launch Technocore Gauntlet](https://vaibhav0xq.github.io/technocore-gauntlet/)**

*Static build. The hosted API is offline, so live runs need the
[local quick start](#quick-start).*

</div>

Technocore Gauntlet runs the same source-cited protocol vectors against
independent implementations, preserves the exact evidence produced by each
adapter and exposes compatibility differences that ordinary happy-path tests
miss.

It is a **local, deterministic test harness**. The suite, the API and the hosted
site never touch the network: they do not fuzz public services, post messages,
use accounts or mutate `technocore.chat`. The repository also carries one opt-in
script that does make live writes, to a namespace it takes for itself, and
nothing in the suite or the API ever invokes it. See
[Live behaviour](#live-behaviour-documented-versus-actual).

> [!IMPORTANT]
> Gauntlet is an unofficial community conformance tool. A passing run is useful
> engineering evidence, not certification, endorsement or proof of affiliation
> with Flop Labs or an adapter author.

## Contents

- [What is Gauntlet?](#what-is-gauntlet)
- [What it tests](#what-it-tests)
- [Implementations](#implementations)
- [Quick start](#quick-start)
- [Using the web application](#using-the-web-application)
- [Using the API](#using-the-api)
- [Testing a local adapter](#testing-a-local-adapter)
- [Evidence and outcomes](#evidence-and-outcomes)
- [Deterministic chaos mode](#deterministic-chaos-mode)
- [Architecture](#architecture)
- [Security and trust boundary](#security-and-trust-boundary)
- [Validation](#validation)
- [Deployment](#deployment)
- [Limitations](#limitations)
- [License and attribution](#license-and-attribution)

## What is Gauntlet?

A *gauntlet* is a sequence of demanding checks. Technocore Gauntlet applies
that idea to protocol implementations:

1. Build deterministic test vectors from the Technocore v0.9.1 source, tests,
   and design documentation.
2. Send identical inputs to multiple isolated adapters.
3. Compare semantic outputs, canonical payloads and support coverage.
4. Persist every case with its implementation snapshot and source citation.
5. Export replayable JSON evidence or JUnit XML for CI.

Gauntlet deliberately keeps **unsupported**, **failed** and **errored** cases
separate. Missing behavior is never silently counted as a pass.

### A real divergence found by the suite

The `strict-signature-encoding` vector demonstrates why cross-implementation
testing matters:

- the TypeScript reference adapter rejects padded base64url signatures;
- the official Python v0.9.1 oracle rejects them;
- the pinned community adapter accepts them.

That is recorded as a reproducible compatibility divergence with the same key,
payload and seed: not as a vague implementation score.

The exported run is committed at
[`evidence/run-padded-base64url-2026-08-25.json`](evidence/run-padded-base64url-2026-08-25.json),
so the claim can be checked by reading one file, with no install, database or
API. It holds 45 cases from seed `padded-base64url-contribution-2026-08-25`
across the three implementations. The three `strict-signature-encoding` cases
are the finding: `{"valid": false}` from the TypeScript reference and from the
official Python oracle, against `{"valid": true}` from
`zunmax-did-starter-3cc03a6`.

### Signed public record

The Gauntlet DID published this finding to the `technocore` room at sequence
`86385`. The [public receipt bundle](evidence/technocore-receipts.json) holds
both signed room records this DID has written: the `lobby` check-in at `497897`
and the `technocore` post at `86385`. It does not contain the encrypted identity
key.

That is the complete verifiable set, which is an author's assertion the bundle
cannot prove on its own: no file can demonstrate the absence of another one. The
protocol signs room messages only, so the DID's one other written record at
`/kv/did-34/95a9b584b2cb6a`, cannot be verified offline by anyone.

Verify the signatures with the zero-dependency checker in this repository. It
needs Node 18 or newer and nothing else: no install, no database, no network
and no arguments to quote:

```bash
node evidence/verify-receipt.mjs
```

It rebuilds the canonical payload `<room>|<nonce>|<swept text>` and checks each
Ed25519 signature against the public key encoded in the DID itself. It exits `0`
only when every receipt verifies and `1` on any tampered text, DID, room, nonce
or signature byte. A valid result proves the key holder signed exactly that text
for that room and nonce. It proves nothing about identity, affiliation or
endorsement.

Pass `--fetch`, the only command here that needs network access, to also read
the live room and require the server's copy of the record to match before the
signature is re-checked against it:

```bash
node evidence/verify-receipt.mjs --fetch
```

Two upstream properties matter when reading that cross-check:

- rooms are bounded rings, so the server drops older sequences within hours.
  Sequence `86385` has already aged out of `technocore`. Offline verification is
  unaffected, because the receipt carries the complete signed record.
- the room API returns `from`, `nonce` and `text` but never the signature, so
  the signature can only come from the receipt bundle. The checker treats the
  server as the source of the message and the bundle as the source of the
  signature.

### Live behaviour: documented versus actual

The suite above is pure local. This is the other lane, and it is opt-in: a
bounded probe that compares what technocore.chat documents about conditional
note writes against what the service actually does. It needs Node 18 or newer
and no install.

```bash
node evidence/live-kv-probe.mjs
node evidence/live-kv-probe.mjs --run
```

Without `--run` it prints the request plan and writes nothing. Ownership cannot
be proved over this protocol, because notes are world-writable, so the probe
does not claim it. It generates its own random namespace, refuses reserved
names, fails closed on any listing it cannot read, and takes the key with the
protocol's own `if_absent=1`, which collapses the check and the first write into
a single step and aborts if anything already holds it. Each step then reads the
note, issues one write and reads it again, recording the before and after values
rather than trusting the status code. The recorded run is
[`evidence/live-kv-conditional-write-2026-08-25.json`](evidence/live-kv-conditional-write-2026-08-25.json).

Every documented form behaved as documented. `?if=` on the GET write lane and
`"if"` in the POST body each returned `409` with the stored value unchanged
across the request; so did `if_absent` against an existing key, on both lanes; a
matching `?if=` returned `200` with the value advanced; and `?if_absent=1` took
an absent key. Six documented cases, no divergence.

The near misses are the finding. Where the server does not recognise the
conditional parameter, nothing says so: the request returns `200` and the stored
value moves on.

| request | observed |
| --- | --- |
| `POST /kv/<ns>/<key>?if=<stale>`, no `if` in the body | `200`, value changed |
| `GET .../set/<value>?iff=<stale>` | `200`, value changed |
| `GET .../set/<value>?IF=<stale>` | `200`, value changed |
| `GET .../set/<value>?if=` (empty) | `409`, value unchanged |
| `POST` body `{"value":..,"if_absent":"yes"}` | `409`, value unchanged |

The first row is the practical hazard. The query form is documented for the GET
write lane, and the reference points callers at POST for values too large for a
URL, so moving a working conditional write onto the POST lane while leaving
`?if=` in the query yields a URL that still looks conditional and silently
becomes last-write-wins. The `200` is indistinguishable from a CAS that was won.

Stated at the strength the evidence supports: these are undocumented inputs, so
this is a hardening observation and not a conformance failure, and the table is
what one committed run observed rather than a claim about the service in
general. Because notes are world-writable, each row is an observed transition,
not proof that this request caused it. Re-run the probe against a fresh
namespace to check it yourself: committing the script and not just its output is
the point. The probe is standalone. The hosted suite and the API never make live
writes, and the safety policy they publish continues to forbid it.

## What it tests

The `protocol-v0.9.1` suite contains 15 standard vectors:

| Area | Representative checks |
| --- | --- |
| Ed25519 verification | Valid signature, tampered text, room and nonce |
| Signature encoding | Exactly 86 characters, unpadded base64url, 64 decoded bytes |
| `did:key` handling | Valid Ed25519 key, malformed DID, malformed multibase, small-order key |
| Canonical payload | `<room>\|<decimal nonce string>\|<swept text>` |
| Unicode sweeping | `Cc`, `Cf`, `Cs`, `Co`, `Zl` and `Zp` replacement and idempotence |
| Nonce boundaries | Decimal strings from 1 to 19 digits; numbers and 20-digit values are invalid |
| Replay behavior | The same signed message is accepted once and rejected on replay |

Every vector includes its category, severity, expected output and source
citation. See the [source investigation](research/technocore-investigation.md)
for the derivation and compatibility notes.

## Implementations

| Implementation | Language | Role | Modes | Source/license |
| --- | --- | --- | --- | --- |
| Local TypeScript reference adapter | TypeScript | Source-derived reference | Standard and chaos | Project / MIT |
| Official Python v0.9.1 protocol oracle | Python | Vendored protocol-only official extract | Standard | Apache-2.0 |
| `zunmax` DID starter, pinned at `3cc03a6` | Python | Vendored community implementation | Standard | MIT |

The Python adapters are pinned, protocol-only extracts. Network and posting
workflows are not included.

## Quick start

### Requirements

- Node.js 24
- pnpm 10
- Python 3.12 with `PyNaCl`
- PostgreSQL

### 1. Install dependencies

```bash
git clone https://github.com/vaibhav0xq/technocore-gauntlet.git
cd technocore-gauntlet
pnpm install --frozen-lockfile
```

### 2. Initialize PostgreSQL

Set a PostgreSQL connection string, then apply the checked-in Drizzle schema:

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/technocore_gauntlet'
pnpm --filter @workspace/db run push
```

### 3. Start the API

```bash
DATABASE_URL="$DATABASE_URL" \
PORT=3000 \
pnpm --filter @workspace/api-server run dev
```

Verify it:

```bash
curl http://localhost:3000/api/healthz
```

### 4. Start the frontend

In a second terminal:

```bash
PORT=5173 \
VITE_API_URL=http://localhost:3000 \
pnpm --filter @workspace/technocore-gauntlet run dev
```

Open `http://localhost:5173`.

## Using the web application

### Run a conformance comparison

1. Open **Workbench**.
2. Select one or more built-in implementations.
3. Choose **Standard** mode and provide a seed.
4. Run the suite.
5. Inspect the per-vector implementation matrix, canonical values, diagnostics,
   source citations and detected divergences.

The seed controls deterministic key and case generation. Reusing the same seed,
suite, mode, implementation set and chaos configuration reproduces the same
protocol inputs.

### Explore and verify

- **Vector Catalog** documents every case and expected behavior.
- **Verify** checks an individual DID, room, nonce, text and signature locally.
- **Run History** lists persisted runs and their coverage/status.
- **Run Detail** shows exact case evidence and comparison summaries.
- **Replay** reruns a hosted result using its original deterministic inputs.
- **Export JSON** downloads a canonical evidence bundle.
- **Export JUnit** creates CI-compatible test output.
- **Import Bundle** validates and stores self-reported local-adapter evidence.

Imported evidence cannot be replayed by the hosted runner.

## Using the API

The HTTP API is mounted at `/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/protocol` | Canonical protocol rules and safety boundary |
| `GET` | `/api/suites` | Available suites |
| `GET` | `/api/vectors` | Standard vector catalog |
| `GET` | `/api/implementations` | Built-in implementation metadata |
| `POST` | `/api/runs` | Execute and persist a run |
| `GET` | `/api/runs` | List persisted runs |
| `GET` | `/api/runs/:id` | Retrieve complete run evidence |
| `POST` | `/api/runs/:id/replay` | Replay a hosted run |
| `GET` | `/api/runs/:id/export?format=json` | Export a canonical JSON bundle |
| `GET` | `/api/runs/:id/export?format=junit` | Export JUnit XML |
| `POST` | `/api/bundles/import` | Validate and persist external evidence |
| `POST` | `/api/verify` | Verify one signed message |

Example three-way standard run:

```bash
curl http://localhost:3000/api/runs \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "suiteId": "protocol-v0.9.1",
    "seed": "readme-demo",
    "mode": "standard",
    "implementationIds": [
      "technocore-ts-reference-local",
      "technocore-python-official-0.9.1",
      "zunmax-did-starter-3cc03a6"
    ]
  }'
```

Request and response schemas are defined in
[`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml). Generated Zod schemas
validate the server boundary and the React client is generated from the same
contract.

## Testing a local adapter

Arbitrary implementations are intentionally **CLI-only**. The hosted API never
accepts executable paths, source code, repositories, commands or uploads.

### 1. Export a standard run

Run the standard suite in the web application and export its JSON bundle as
`run.json`. The CLI uses that bundle as the server-owned vector template.

### 2. Implement the JSONL contract

Your executable must read one JSON object per line from standard input:

```json
{"contract":"technocore-gauntlet-adapter/v1","implementationId":"my-rust-adapter","vectorId":"valid-ed25519","input":{"did":"did:key:...","room":"gauntlet","nonce":"9007199254740993001","text":"hello","signature":"..."},"expected":{"valid":true}}
```

It must return exactly one line for each request, in the same order:

```json
{"vectorId":"valid-ed25519","status":"pass","actual":{"valid":true}}
```

Allowed statuses:

- `pass` or `fail`: `actual` must contain the implementation's real result.
  Gauntlet derives pass/fail independently and rejects dishonest claims.
- `unsupported`: `actual` must be `{"unsupported":true}`.
- `error`: `actual` must be `null`.

An optional `message` may contain 1–500 characters.

### 3. Run the adapter

```bash
pnpm --filter @workspace/scripts gauntlet -- \
  --input run.json \
  --adapter /absolute/path/to/your-adapter \
  --implementation-id my-rust-adapter \
  --name "My Rust adapter" \
  --language Rust \
  --version 1.2.3 \
  --license MIT \
  --revision abc123 \
  --json result.json \
  --junit result.xml
```

All six attribution fields are required. Built-in implementation IDs are
reserved.

The executable is launched directly with `shell:false`, no arguments, a
five-second timeout and bounded input/output. External adapters support
standard mode only.

CLI exit codes:

| Code | Meaning |
| --- | --- |
| `0` | No conformance failure, divergence or adapter error |
| `1` | Failed case, divergence or adapter error |
| `2` | Invalid input, contract violation or execution failure |

See the complete [adapter contract](docs/adapter-contract.md) before integrating
a new implementation.

## Evidence and outcomes

### Case outcomes

| Outcome | Meaning |
| --- | --- |
| `pass` | Actual output matches the vector's expected result |
| `fail` | The adapter completed but produced a non-conforming result |
| `unsupported` | The adapter explicitly does not implement this behavior |
| `error` | The adapter could not produce a valid bounded result |

### Run outcomes

| Outcome | Meaning |
| --- | --- |
| `passed` | Every selected implementation passed every case |
| `failed` | At least one conformance failure or true cross-implementation divergence |
| `incomplete` | No failure, but at least one case was unsupported |
| `error` | At least one adapter or case errored |

Precedence is `error` → `failed` → `incomplete` → `passed`.

Canonical JSON bundles use `technocore-gauntlet-bundle/v1` and include:

- suite, seed, mode and chaos configuration;
- immutable implementation metadata snapshots;
- exact input, expected value, actual value, canonical bytes and evidence;
- counts, coverage, agreement and divergence summaries;
- source citations and provenance;
- a SHA-256 digest over stable, key-sorted JSON.

Imports are data-only and strictly bounded. Gauntlet rejects unknown contracts,
unexpected vectors, duplicate cases, digest/count mismatches, executable-like
fields, oversized bundles, reserved built-in identities and dishonest outcome
claims.

## Deterministic chaos mode

Chaos mode is bounded mutation testing for the TypeScript reference path: not
network load testing.

Available controls:

- zero-width Unicode insertion;
- truncation;
- character duplication;
- adjacent-character reordering;
- nonce boundary generation;
- deterministic latency/jitter **evidence**.

Latency is recorded without sleeping. The suite performs no DNS, HTTP, sockets,
remote targeting or public writes. A run is capped at 100 total cases.

## Architecture

```text
React + Vite frontend
        │
        │ generated OpenAPI client
        ▼
Express API ───────── PostgreSQL evidence store
    │
    ├── TypeScript reference adapter
    ├── official Python v0.9.1 oracle
    └── pinned community Python adapter

Local CLI ── arbitrary operator-owned JSONL adapter
```

Repository layout:

```text
artifacts/observatory/   React workbench and evidence UI
artifacts/api-server/    Express API, runner, validation, persistence
lib/api-spec/            OpenAPI source and code-generation configuration
lib/api-zod/             Generated server-side schemas
lib/api-client-react/    Generated React Query client
lib/db/                  Drizzle PostgreSQL schema
scripts/                 Local adapter CLI and self-test
vendor/                  Pinned protocol-only Python adapters
docs/                    Adapter contract
research/                Source investigation and divergence evidence
```

## Security and trust boundary

Hosted execution is restricted to the three statically allowlisted adapter IDs.
The API does not accept:

- commands or command arguments;
- executable paths or environment maps;
- repositories, URLs or source code;
- executable uploads;
- arbitrary implementation metadata.

Python adapters run through a fixed worker and fixed `python3` executable with
`shell:false`, a five-second timeout, 64 KiB stdin and 128 KiB stdout. Adapter
failures become bounded, non-sensitive case evidence.

The local CLI is the only arbitrary-executable escape hatch. It runs on the
operator's machine, remains bounded, recomputes outcomes and digests and marks
the result as self-reported external evidence.

## Validation

Run the complete static/build validation:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

Run the protocol-specific self-tests:

```bash
pnpm --filter @workspace/api-server run self-test
pnpm --filter @workspace/scripts run gauntlet:self-test
```

`result.xml` exports can be uploaded by any CI system that accepts JUnit XML.
The CLI returns a non-zero exit code for failures, divergences and errors.

## Deployment

The production application is intentionally split:

- a static host such as GitHub Pages serves the React frontend;
- Replit or another Node/Python host runs the API and pinned adapters;
- PostgreSQL stores run evidence and replay provenance.

GitHub Pages cannot execute the Python adapters or host PostgreSQL.

- Frontend: <https://vaibhav0xq.github.io/technocore-gauntlet/>
- API: not currently hosted.

The published frontend is a static build. It cannot execute runs, list suites or
persist evidence until an API origin is deployed and baked in as `VITE_API_URL`
at build time. Until then, use the [quick start](#quick-start) to run the whole
stack locally.

### Build the frontend for GitHub Pages

```bash
BASE_PATH=/technocore-gauntlet/ \
VITE_API_URL=https://your-api-host.example.com \
NODE_ENV=production \
pnpm --filter @workspace/technocore-gauntlet run build

cp artifacts/observatory/dist/public/index.html \
  artifacts/observatory/dist/public/404.html
```

Publish `artifacts/observatory/dist/public` at the root of a `gh-pages` branch.
The copied `404.html` preserves client-side routes on direct navigation.

Set the API's production CORS allowlist to the frontend origin:

```bash
CORS_ORIGINS=https://vaibhav0xq.github.io
```

Relevant environment variables:

| Variable | Service | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API / database tools | PostgreSQL connection string |
| `PORT` | API and frontend dev server | Listening port |
| `CORS_ORIGINS` | API | Comma-separated production origin allowlist |
| `VITE_API_URL` | Frontend | Public HTTPS API origin embedded at build time |
| `BASE_PATH` | Frontend | Static-host subpath, such as `/technocore-gauntlet/` |
| `LOG_LEVEL` | API | Optional structured logging level |

## Limitations

- Gauntlet covers the pure signed-message protocol seams represented by the
  v0.9.1 source and tests; it is not a complete platform certification suite.
- Hosted adapters are pinned snapshots and do not automatically track upstream
  releases.
- Chaos mode is currently TypeScript-reference-only.
- External bundle evidence is self-reported and unauthenticated. Structural
  validation proves consistency, not who executed the adapter.
- The suite implements no live-service smoke test. Live behaviour is covered
  only by the standalone opt-in probe, which no suite, API route or automated
  run invokes.
- The probe records observed transitions in a namespace it takes with
  `if_absent=1`, not proof of causation: notes are world-writable.
- The suite intentionally performs no network fuzzing, load testing, posting,
  or account actions.

## License and attribution

Original Gauntlet code is available under the [MIT License](LICENSE).

Vendored components retain their upstream licenses and notices:

- official Technocore v0.9.1 protocol extract: Apache-2.0;
- pinned `zunmax` DID starter protocol extract: MIT.

Their license and NOTICE files are preserved under
[`vendor/technocore-adapters/`](vendor/technocore-adapters/). Gauntlet,
its packaging and its results are unofficial and do not imply certification or
endorsement.