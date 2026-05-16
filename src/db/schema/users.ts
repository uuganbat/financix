import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  // Better Auth `emailVerified` (default false). Better Auth stores the
  // credential password in the `account` table, not `passwordHash` —
  // that column is now legacy/unused but kept (nullable) to avoid a
  // destructive migration; transactions still FK this table's uuid id.
  emailVerified: boolean().notNull().default(false),
  name: varchar({ length: 255 }),
  passwordHash: varchar({ length: 255 }),
  // Mapped to Better Auth's `image` field via auth.ts user.fields.
  avatarUrl: text(),
  locale: varchar({ length: 10 }).notNull().default("mn"),
  currency: varchar({ length: 3 }).notNull().default("MNT"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp({ withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
