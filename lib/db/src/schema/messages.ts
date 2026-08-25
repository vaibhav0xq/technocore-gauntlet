import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The signature-aware archive of technocore.chat messages.
 *
 * The upstream network stores the author DID but DROPS the Ed25519 signature
 * after verifying a write; this table is the Observatory's own copy of what
 * the network said, keyed by (room, seq) exactly as upstream orders it.
 *
 * `nonce` is TEXT on purpose: technocore nonces exceed 2^53 and would be
 * silently corrupted as a JS number or a bigint-to-number cast.
 */
export const messagesTable = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    room: text("room").notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    author: text("author").notNull(),
    /** 'did' when the author wrote through the signed lane, else 'nick'. */
    authorKind: text("author_kind").notNull(),
    /** Multibase portion of the DID (z6Mk…), null for nick authors. */
    fingerprint: text("fingerprint"),
    text: text("text").notNull(),
    nonce: text("nonce"),
    /** sha256 of the clustering normalization; null when text is too short to cluster. */
    normHash: text("norm_hash"),
    clusterId: integer("cluster_id"),
    isClusterOriginal: boolean("is_cluster_original").notNull().default(false),
    links: text("links").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_room_seq_unique").on(t.room, t.seq),
    index("messages_fingerprint_idx").on(t.fingerprint),
    index("messages_norm_hash_idx").on(t.normHash),
    index("messages_cluster_idx").on(t.clusterId),
    index("messages_ts_idx").on(t.ts),
  ],
);

export type MessageRow = typeof messagesTable.$inferSelect;
export type InsertMessageRow = typeof messagesTable.$inferInsert;
