import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The receipt depository. The network verifies a signature once and throws
 * it away; a receipt deposited here is re-verified by the Observatory and
 * stored verbatim so anyone can re-run the verification forever in their
 * own browser, without trusting this server.
 */
export const receiptsTable = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    did: text("did").notNull(),
    fingerprint: text("fingerprint").notNull(),
    room: text("room").notNull(),
    /** TEXT on purpose because technocore nonces exceed 2^53. */
    nonce: text("nonce").notNull(),
    text: text("text").notNull(),
    /** Exactly what the signature covers: room|nonce|swept-text. */
    payloadCanonical: text("payload_canonical").notNull(),
    /** Unpadded base64url, 86 chars, stored verbatim. */
    signature: text("signature").notNull(),
    verified: boolean("verified").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("receipts_signature_unique").on(t.signature),
    index("receipts_fingerprint_idx").on(t.fingerprint),
  ],
);

export type ReceiptRow = typeof receiptsTable.$inferSelect;
export type InsertReceiptRow = typeof receiptsTable.$inferInsert;
