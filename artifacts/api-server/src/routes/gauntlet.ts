import { Router, type IRouter } from "express";
import {
  CreateRunBody,
  CreateRunResponse,
  ExportRunPathParams,
  ExportRunQueryParams,
  ExportRunResponse,
  GetProtocolResponse,
  GetRunParams,
  GetRunResponse,
  GetVectorParams,
  GetVectorResponse,
  ListImplementationsResponse,
  ListRunsQueryParams,
  ListRunsResponse,
  ListSuitesResponse,
  ListVectorsResponse,
  ImportBundleBody,
  ImportBundleResponse,
  ReplayRunBody,
  ReplayRunParams,
  ReplayRunResponse,
  VerifyMessageBody,
  VerifyMessageResponse,
} from "@workspace/api-zod";
import { exportBundle, runToJUnit, validateImportedBundle } from "../lib/bundles";
import {
  executeRun,
  IMPLEMENTATIONS,
  PROTOCOL,
  SUITES,
  verifyLocally,
  VECTORS,
} from "../lib/gauntlet";
import {
  findRun,
  listPersistedRuns,
  persistRun,
} from "../lib/gauntlet-store";

const router: IRouter = Router();
const RUN_KEYS = new Set(["suiteId", "seed", "mode", "config", "implementationIds"]);
const CHAOS_KEYS = new Set([
  "unicodeInsertions",
  "truncations",
  "duplicates",
  "reorderings",
  "latencyMs",
  "jitterMs",
  "nonceBoundary",
]);

function unexpectedKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).filter((key) => !allowed.has(key));
}

router.get("/protocol", (_req, res): void => {
  res.json(GetProtocolResponse.parse(PROTOCOL));
});

router.get("/suites", (_req, res): void => {
  res.json(ListSuitesResponse.parse({ items: SUITES }));
});

router.get("/vectors", (_req, res): void => {
  res.json(ListVectorsResponse.parse({ items: VECTORS }));
});

router.get("/vectors/:id", (req, res): void => {
  const params = GetVectorParams.safeParse(req.params);
  if (!params.success) {
    req.log.warn({ errors: params.error.message }, "Invalid vector parameters");
    res.status(400).json({ error: params.error.message });
    return;
  }
  const vector = VECTORS.find((item) => item.id === params.data.id);
  if (!vector) {
    res.status(404).json({ error: "Vector not found" });
    return;
  }
  res.json(GetVectorResponse.parse(vector));
});

router.get("/runs", async (req, res): Promise<void> => {
  const query = ListRunsQueryParams.safeParse(req.query);
  if (!query.success) {
    req.log.warn({ errors: query.error.message }, "Invalid runs query");
    res.status(400).json({ error: query.error.message });
    return;
  }
  const limit = query.data.limit ?? 20;
  const items = await listPersistedRuns(limit);
  res.json(ListRunsResponse.parse({ items, limit }));
});

router.post("/runs", async (req, res): Promise<void> => {
  const extraRunKeys = unexpectedKeys(req.body, RUN_KEYS);
  const rawConfig =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>).config
      : undefined;
  const extraConfigKeys = unexpectedKeys(rawConfig, CHAOS_KEYS);
  if (extraRunKeys.length > 0 || extraConfigKeys.length > 0) {
    const fields = [...extraRunKeys, ...extraConfigKeys.map((key) => `config.${key}`)];
    req.log.warn({ fields }, "Run request contains forbidden fields");
    res.status(400).json({
      error: `Unexpected fields are not accepted: ${fields.join(", ")}`,
    });
    return;
  }
  const body = CreateRunBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid run request");
    res.status(400).json({ error: body.error.message });
    return;
  }
  let run;
  try {
    run = await executeRun(body.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log.warn({ error: message }, "Run rejected");
    res.status(400).json({ error: message });
    return;
  }
  await persistRun(run);
  req.log.info(
    { runId: run.id, suiteId: run.suiteId, status: run.status },
    "Gauntlet run persisted",
  );
  res.status(201).json(CreateRunResponse.parse(run));
});

router.get("/runs/:id", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    req.log.warn({ errors: params.error.message }, "Invalid run parameters");
    res.status(400).json({ error: params.error.message });
    return;
  }
  const run = await findRun(params.data.id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(GetRunResponse.parse(run));
});

router.get("/runs/:id/export", async (req, res): Promise<void> => {
  const extraQueryKeys = unexpectedKeys(req.query, new Set(["format"]));
  if (extraQueryKeys.length > 0) {
    res.status(400).json({ error: `Unexpected fields are not accepted: ${extraQueryKeys.join(", ")}` });
    return;
  }
  const params = ExportRunPathParams.safeParse(req.params);
  const query = ExportRunQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : query.error?.message,
    });
    return;
  }
  const run = await findRun(params.data.id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (query.data.format === "junit") {
    res
      .set("Content-Disposition", `attachment; filename="gauntlet-${run.id}.xml"`)
      .type("application/xml")
      .send(runToJUnit(run));
    return;
  }
  res.set("Content-Disposition", `attachment; filename="gauntlet-${run.id}.json"`);
  res.json(ExportRunResponse.parse(exportBundle(run)));
});

router.post("/runs/:id/replay", async (req, res): Promise<void> => {
  const params = ReplayRunParams.safeParse(req.params);
  const body = ReplayRunBody.safeParse(req.body);
  if (!params.success) {
    req.log.warn({ errors: params.error.message }, "Invalid replay parameters");
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid replay body");
    res.status(400).json({ error: body.error.message });
    return;
  }
  const original = await findRun(params.data.id);
  if (!original) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (original.provenance?.kind === "import") {
    res.status(400).json({ error: "Imported evidence cannot be replayed by the hosted runner" });
    return;
  }
  const replay = await executeRun({
    suiteId: original.suiteId,
    seed: original.seed,
    mode: original.mode,
    config: original.config,
    replayOf: original.id,
    implementationIds: original.implementationIds,
  });
  await persistRun(replay);
  req.log.info(
    { runId: replay.id, replayOf: original.id },
    "Gauntlet replay persisted",
  );
  res.status(201).json(ReplayRunResponse.parse(replay));
});

router.post("/bundles/import", async (req, res): Promise<void> => {
  try {
    const run = validateImportedBundle(req.body);
    const generated = ImportBundleBody.safeParse(req.body);
    if (!generated.success) throw new Error(generated.error.message);
    await persistRun(run);
    res.status(201).json(ImportBundleResponse.parse(run));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log.warn({ error: message }, "Bundle import rejected");
    res.status(400).json({ error: message });
  }
});

router.post("/verify", (req, res): void => {
  const body = VerifyMessageBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid verifier request");
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(VerifyMessageResponse.parse(verifyLocally(body.data)));
});

router.get("/implementations", (_req, res): void => {
  res.json(ListImplementationsResponse.parse({ items: IMPLEMENTATIONS }));
});

export default router;