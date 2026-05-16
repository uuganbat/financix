import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { bankEnum, accountTypeEnum } from "./enums";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: varchar({ length: 255 }).notNull(),
    bank: bankEnum().notNull(),

    // Last 4 digits only — full account number lives in the bank statement file.
    accountLast4: varchar({ length: 4 }),

    accountType: accountTypeEnum().notNull().default("checking"),
    currency: varchar({ length: 3 }).notNull().default("MNT"),

    initialBalance: numeric({ precision: 18, scale: 2 }).notNull().default("0"),
    currentBalance: numeric({ precision: 18, scale: 2 }).notNull().default("0"),

    isActive: boolean().notNull().default(true),
    color: varchar({ length: 7 }),
    icon: varchar({ length: 50 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("idx_accounts_user").on(t.userId),
    uniqueIndex("uq_accounts_user_bank_last4").on(
      t.userId,
      t.bank,
      t.accountLast4,
    ),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
