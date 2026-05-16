import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { accounts } from "./accounts";
import { bankEnum, importStatusEnum, importSourceEnum } from "./enums";

export const imports = pgTable(
  "imports",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid().references(() => accounts.id, { onDelete: "set null" }),

    source: importSourceEnum().notNull(),
    bank: bankEnum().notNull(),
    fileName: varchar({ length: 500 }),
    filePath: varchar({ length: 1000 }),
    fileType: varchar({ length: 10 }),
    fileSize: integer(),
    // sha256 of uploaded file — blocks re-uploading the same file by accident.
    fileHash: varchar({ length: 64 }),

    status: importStatusEnum().notNull().default("pending"),
    totalRows: integer(),
    importedRows: integer().notNull().default(0),
    skippedRows: integer().notNull().default(0),
    duplicateRows: integer().notNull().default(0),
    errorMessage: text(),

    dateRangeStart: date(),
    dateRangeEnd: date(),

    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_imports_user").on(t.userId, t.createdAt),
    index("idx_imports_file_hash").on(t.userId, t.fileHash),
  ],
);

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
