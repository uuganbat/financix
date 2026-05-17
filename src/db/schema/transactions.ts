import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  date,
  time,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { accounts } from "./accounts";
import { categories } from "./categories";
import { imports } from "./imports";
import { txnTypeEnum, categorySourceEnum } from "./enums";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),

    type: txnTypeEnum().notNull(),
    amount: numeric({ precision: 18, scale: 2 }).notNull(),
    currency: varchar({ length: 3 }).notNull().default("MNT"),

    // Running balance after this txn, when the statement provides one
    // (Khan/MBank/TDB). Golomt statements carry no per-row balance → null.
    balanceAfter: numeric({ precision: 18, scale: 2 }),

    description: text().notNull(),
    displayName: varchar({ length: 500 }),
    notes: text(),

    date: date().notNull(),
    time: time(),

    transferPairId: uuid().references((): AnyPgColumn => transactions.id, {
      onDelete: "set null",
    }),
    transferAccountId: uuid().references(() => accounts.id, {
      onDelete: "set null",
    }),

    importId: uuid().references(() => imports.id, { onDelete: "set null" }),
    bankRef: varchar({ length: 255 }),
    rawData: jsonb(),

    // sha256(account_id|date|amount|description|bank_ref) — enforces dedup
    // across re-imports. See packages/parser dedup helper.
    dedupHash: varchar({ length: 64 }).notNull(),

    categorySource: categorySourceEnum().notNull().default("manual"),
    categoryConfidence: numeric({ precision: 3, scale: 2 }),

    isRecurring: boolean().notNull().default(false),
    isExcluded: boolean().notNull().default(false),
    isReviewed: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_txn_dedup").on(t.accountId, t.dedupHash),
    index("idx_txn_user_date").on(t.userId, t.date.desc()),
    index("idx_txn_account_date").on(t.accountId, t.date.desc()),
    index("idx_txn_category").on(t.categoryId),
    index("idx_txn_type").on(t.userId, t.type, t.date.desc()),
    index("idx_txn_import").on(t.importId),
    index("idx_txn_search").using(
      "gin",
      sql`to_tsvector('simple', ${t.description})`,
    ),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
