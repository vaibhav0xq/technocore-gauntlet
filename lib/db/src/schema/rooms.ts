import {
  bigint,
  boolean,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * One row per technocore.chat room we know about (the public /rooms surface
 * lists the top rooms only — a documented caveat of the methodology).
 * `remoteLastSeq` is the sequence the network advertises; `ingestedSeq` is
 * our archive cursor for that room.
 */
export const roomsTable = pgTable("rooms", {
  room: text("room").primaryKey(),
  topic: text("topic"),
  remoteLastSeq: bigint("remote_last_seq", { mode: "number" })
    .notNull()
    .default(0),
  ingestedSeq: bigint("ingested_seq", { mode: "number" }).notNull().default(0),
  watched: boolean("watched").notNull().default(true),
  zeroResponseShare: real("zero_response_share"),
  nickDiversity: real("nick_diversity"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RoomRow = typeof roomsTable.$inferSelect;
export type InsertRoomRow = typeof roomsTable.$inferInsert;
