import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gauntletRunsTable = pgTable(
  "gauntlet_runs",
  {
    id: uuid("id").primaryKey(),
    suiteId: text("suite_id").notNull(),
    suiteVersion: text("suite_version").notNull(),
    implementationId: text("implementation_id").notNull(),
    seed: text("seed").notNull(),
    mode: text("mode").notNull(),
    config: jsonb("config").notNull(),
    status: text("status").notNull(),
    totalCount: integer("total_count").notNull(),
    passedCount: integer("passed_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    replayOf: uuid("replay_of"),
    implementationIds: jsonb("implementation_ids"),
    implementations: jsonb("implementations"),
    contractDigest: text("contract_digest"),
    vectorDigest: text("vector_digest"),
    bundleDigest: text("bundle_digest"),
    comparisonSummary: jsonb("comparison_summary"),
    provenance: jsonb("provenance"),
  },
  (table) => [
    index("gauntlet_runs_finished_at_idx").on(table.finishedAt),
    index("gauntlet_runs_suite_id_idx").on(table.suiteId),
    index("gauntlet_runs_replay_of_idx").on(table.replayOf),
  ],
);

export const gauntletRunCasesTable = pgTable(
  "gauntlet_run_cases",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => gauntletRunsTable.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    caseId: text("case_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    input: jsonb("input").notNull(),
    expected: jsonb("expected").notNull(),
    actual: jsonb("actual").notNull(),
    expectedCanonical: text("expected_canonical"),
    actualCanonical: text("actual_canonical"),
    byteDiff: jsonb("byte_diff"),
    durationMs: real("duration_ms").notNull(),
    citation: text("citation").notNull(),
    evidence: jsonb("evidence").notNull(),
    implementationId: text("implementation_id"),
  },
  (table) => [
    index("gauntlet_run_cases_run_ordinal_idx").on(
      table.runId,
      table.ordinal,
    ),
    index("gauntlet_run_cases_case_id_idx").on(table.caseId),
  ],
);

export const insertGauntletRunSchema = createInsertSchema(
  gauntletRunsTable,
);
export const insertGauntletRunCaseSchema = createInsertSchema(
  gauntletRunCasesTable,
);
export type InsertGauntletRun = z.infer<typeof insertGauntletRunSchema>;
export type GauntletRunRow = typeof gauntletRunsTable.$inferSelect;
export type InsertGauntletRunCase = z.infer<
  typeof insertGauntletRunCaseSchema
>;
export type GauntletRunCaseRow = typeof gauntletRunCasesTable.$inferSelect;