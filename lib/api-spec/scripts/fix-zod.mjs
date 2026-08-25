// Post-codegen fix: orval emits zod v4 API (zod.int(), etc.) but imports the
// v3 entrypoint. zod@3.25+ ships the v4 API under the `zod/v4` subpath, so
// rewrite the generated import to match the emitted API.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  here,
  "..",
  "..",
  "api-zod",
  "src",
  "generated",
  "api.ts",
);

const src = readFileSync(target, "utf8");
const fixed = src
  .replace(/from ['"]zod['"]/g, "from 'zod/v4'")
  // Orval otherwise collides with its query type of the same name.
  .replace(
    "export const ExportRunParams = zod.object(",
    "export const ExportRunPathParams = zod.object(",
  );
if (fixed !== src) {
  writeFileSync(target, fixed);
  console.log("[fix-zod] normalized zod import to zod/v4 in", target);
} else {
  console.log("[fix-zod] no change needed");
}
