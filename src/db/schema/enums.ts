import { pgEnum } from "drizzle-orm/pg-core";

export const bankEnum = pgEnum("bank", [
  "golomt",
  "kkb",
  "khan",
  "mbank",
  "tdb",
  "cash",
  "other",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "checking",
  "savings",
  "credit",
  "cash",
  "investment",
]);

export const txnTypeEnum = pgEnum("txn_type", [
  "income",
  "expense",
  "transfer",
]);

export const categoryTypeEnum = pgEnum("category_type", [
  "income",
  "expense",
  "transfer",
  "any",
]);

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "partial",
]);

export const importSourceEnum = pgEnum("import_source", [
  "file_upload",
  "email",
  "api",
  "manual",
]);

export const categorySourceEnum = pgEnum("category_source", [
  "manual",
  "rule",
  "ai",
  "shared_cache",
  "recurring",
]);
