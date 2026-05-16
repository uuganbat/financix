import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { categoryTypeEnum } from "./enums";

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    // null = system-default category visible to every user
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),

    name: varchar({ length: 100 }).notNull(),
    nameEn: varchar({ length: 100 }),
    icon: varchar({ length: 50 }),
    color: varchar({ length: 7 }),
    type: categoryTypeEnum().notNull(),

    parentId: uuid().references((): AnyPgColumn => categories.id),
    sortOrder: integer().notNull().default(0),
    isSystem: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("idx_categories_user").on(t.userId),
    // System defaults are global (user_id IS NULL). One per (name, type)
    // so the seed can upsert idempotently.
    uniqueIndex("uq_system_category")
      .on(t.name, t.type)
      .where(sql`${t.userId} is null and ${t.isSystem} = true`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
