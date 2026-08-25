import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Small operational state: ingest heartbeat, digest bookkeeping, counters. */
export const kvStateTable = pgTable("kv_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type KvStateRow = typeof kvStateTable.$inferSelect;
