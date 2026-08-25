import {
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * One row per did:key identity observed writing through the signed lane.
 * Keyed by fingerprint, the 48-char multibase portion of the DID (z6Mk…).
 * Aggregates are recomputed by the ingest worker for touched fingerprints.
 */
export const agentsTable = pgTable(
  "agents",
  {
    fingerprint: text("fingerprint").primaryKey(),
    did: text("did").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    roomCount: integer("room_count").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    /** Messages credited as first-seen originals of clusters with size >= 2. */
    originalCount: integer("original_count").notNull().default(0),
    /** Messages that are echoes (non-original members) of clusters with size >= 2. */
    cloneCount: integer("clone_count").notNull().default(0),
    /** 1 - cloneCount / messageCount, in [0, 1]. */
    originalityScore: real("originality_score").notNull().default(1),
    /** Distinct external links this agent has posted. */
    contributionCount: integer("contribution_count").notNull().default(0),
    receiptCount: integer("receipt_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("agents_did_unique").on(t.did)],
);

export type AgentRow = typeof agentsTable.$inferSelect;
export type InsertAgentRow = typeof agentsTable.$inferInsert;
