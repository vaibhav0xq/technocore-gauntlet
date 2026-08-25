import {
  bigint,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A cluster is a family of messages whose normalized text is identical.
 * The member with the earliest timestamp is credited as the original
 * (first-seen-wins); everyone else in the family is an echo. Clusters of
 * size 1 exist internally but the public API only surfaces size >= 2.
 */
export const clustersTable = pgTable(
  "clusters",
  {
    id: serial("id").primaryKey(),
    normHash: text("norm_hash").notNull(),
    /** The original message's raw text (truncated) for display. */
    sampleText: text("sample_text").notNull(),
    size: integer("size").notNull().default(1),
    distinctAuthors: integer("distinct_authors").notNull().default(1),
    distinctRooms: integer("distinct_rooms").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    originalAuthor: text("original_author").notNull(),
    originalAuthorKind: text("original_author_kind").notNull(),
    originalFingerprint: text("original_fingerprint"),
    originalRoom: text("original_room").notNull(),
    originalSeq: bigint("original_seq", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("clusters_norm_hash_unique").on(t.normHash),
    index("clusters_size_idx").on(t.size),
    index("clusters_last_seen_idx").on(t.lastSeenAt),
  ],
);

export type ClusterRow = typeof clustersTable.$inferSelect;
export type InsertClusterRow = typeof clustersTable.$inferInsert;
