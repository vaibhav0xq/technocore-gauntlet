# Technocore Gauntlet

Technocore Gauntlet is a deterministic protocol-conformance and bounded
chaos-testing lab for Technocore implementations. It runs the same source-cited
vectors against independent adapters, preserves exact evidence, and makes
compatibility differences visible instead of treating unsupported behavior as a
pass.

## What it proves

- Cross-implementation evidence from a local TypeScript reference, the official
  Python v0.9.1 verifier, and a pinned community Python implementation.
- Deterministic replayable runs with explicit `passed`, `failed`, `incomplete`,
  and `error` outcomes.
- Per-case `pass`, `fail`, `unsupported`, and `error` evidence.
- JSON and JUnit exports for local review and CI.
- A real compatibility finding: the pinned community adapter accepts padded
  base64url signatures while the TypeScript and official Python implementations
  reject them.
- Data-only external bundle import with independently derived outcomes.

Imported bundles are self-reported, unauthenticated evidence. They are not
certification, endorsement, or proof that a named implementation produced the
submitted data.

## Hosted architecture

The public application is deliberately split:

- GitHub Pages serves the static React frontend at
  `https://vaibhav0xq.github.io/technocore-gauntlet/`.
- Replit runs the allowlisted adapter API and PostgreSQL evidence store.
- The Pages build receives only the public API origin. Database credentials and
  executable adapter configuration never enter the browser or GitHub Actions.

GitHub Pages cannot run the Python adapters or database by itself.

## Local development

Requirements:

- Node.js 24
- pnpm 10
- Python 3.12
- PostgreSQL

Install and validate:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/api-server run self-test
pnpm --filter @workspace/scripts run gauntlet:self-test
```

Set `DATABASE_URL`, then run the API and frontend in separate terminals:

```bash
pnpm run dev:api
pnpm run dev:web
```

## GitHub Pages deployment

GitHub Pages is published from the generated `gh-pages` branch. Build only the
Observatory frontend with the public HTTPS origin of the published Replit API:

```bash
BASE_PATH=/technocore-gauntlet/ \
VITE_API_URL=https://your-api.replit.app \
NODE_ENV=production \
pnpm --filter @workspace/technocore-gauntlet run build

cp artifacts/observatory/dist/public/index.html \
  artifacts/observatory/dist/public/404.html
```

Publish the contents of `artifacts/observatory/dist/public` at the root of the
`gh-pages` branch, then configure repository Pages settings to deploy from that
branch. The copied `404.html` is the SPA fallback that keeps bookmarked routes
working.

The API production allowlist is configured with `CORS_ORIGINS`. For this Pages
site it must include:

```text
https://vaibhav0xq.github.io
```

## Trust boundary

Hosted execution is limited to statically allowlisted adapters. The hosted API
does not accept commands, executable paths, repositories, URLs, source code,
environment maps, or executable uploads. Arbitrary adapters are local CLI-only
and are launched without a shell under bounded execution.

See [the adapter contract](docs/adapter-contract.md) and
[the source investigation](research/technocore-investigation.md) for the full
evidence and attribution model.

## License

The original Gauntlet code is available under the [MIT License](LICENSE).
Vendored adapters retain their upstream Apache-2.0 and MIT licenses and NOTICE
files under `vendor/technocore-adapters/`.