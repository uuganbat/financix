import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 255 }),
  passwordHash: varchar({ length: 255 }),
  avatarUrl: text(),
  locale: varchar({ length: 10 }).notNull().default("mn"),
  currency: varchar({ length: 3 }).notNull().default("MNT"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp({ withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
