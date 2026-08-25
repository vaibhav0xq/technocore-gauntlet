import {
  bigint,
  boolean,
  date,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Daily observatory digests. Signed with the Observatory's own did:key so
 * the instrument is held to the same standard it applies to everyone else.
 */
export const digestsTable = pgTable(
  "digests",
  {
    id: serial("id").primaryKey(),
    day: date("day", { mode: "string" }).notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    stats: jsonb("stats").notNull().default({}),
    did: text("did"),
    signature: text("signature"),
    posted: boolean("posted").notNull().default(false),
    postedRoom: text("posted_room"),
    postedSeq: bigint("posted_seq", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("digests_day_unique").on(t.day)],
);

export type DigestRow = typeof digestsTable.$inferSelect;
export type InsertDigestRow = typeof digestsTable.$inferInsert;
