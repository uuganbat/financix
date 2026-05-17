/**
 * Import service — ties the pipeline together (SRS §4–5):
 *
 *   upload → detectParser → parse → categorize → dedup → persist
 *
 * Persists into `accounts` / `imports` / `transactions` for the
 * authenticated user, inside one DB transaction. Re-importing the same
 * file (or overlapping ranges) is idempotent: same `file_hash` short-
 * circuits, and `transactions` insert uses the `uq_txn_dedup`
 * (account_id, dedup_hash) conflict target to skip duplicates.
 */

import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, imports, transactions } from "@/db/schema";
import { detectParser } from "@/parser";
import { computeDedupHash } from "@/parser/dedup";
import { categorize } from "@/categorizer";
import type { BankKey } from "@/parser/types";

/** parser BankKey → `bank` enum (only the parsers we ship need to map). */
const BANK_ENUM: Record<
  BankKey,
  "golomt" | "khan" | "mbank" | "tdb" | "other"
> = {
  golomt: "golomt",
  khan: "khan",
  mbank: "mbank",
  tdb: "tdb",
  xacbank: "other",
  arig: "other",
};

const BANK_LABEL: Record<BankKey, string> = {
  golomt: "Голомт банк",
  khan: "Хаан банк",
  mbank: "М банк",
  tdb: "ХХБ (TDB)",
  xacbank: "ХасБанк",
  arig: "Ариг банк",
};

export type CategoryTally = {
  category: string | null;
  count: number;
  amount: number;
};

export type ImportSummary = {
  ok: boolean;
  alreadyImported: boolean;
  bank: BankKey;
  accountLast4?: string;
  accountId?: string;
  importId?: string;
  dateRange: { start: string; end: string } | null;
  parsed: number;
  imported: number;
  duplicates: number;
  skipped: number;
  uncategorized: number;
  byCategory: CategoryTally[];
  warnings: string[];
  errors: string[];
};

export async function importStatement(input: {
  userId: string;
  file: Buffer;
  filename: string;
}): Promise<ImportSummary> {
  const { userId, file, filename } = input;
  const fileHash = createHash("sha256").update(file).digest("hex");
  const fileType =
    filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : null;

  const parser = await detectParser(file, filename);
  if (!parser) {
    return emptySummary("golomt", {
      errors: ["Тохирох parser олдсонгүй — дэмжигдээгүй хуулгын формат."],
    });
  }

  const parsed = await parser.parse(file, filename);
  const bank = parser.bank;

  if (!parsed.success || parsed.transactions.length === 0) {
    return {
      ...emptySummary(bank, {
        warnings: parsed.warnings,
        errors: parsed.errors.map((e) => `мөр ${e.row}: ${e.message}`),
      }),
      accountLast4: parsed.accountLast4,
      dateRange: parsed.dateRange,
    };
  }

  return db.transaction(async (tx) => {
    // Idempotent on the exact file.
    const priorByHash = await tx
      .select({ id: imports.id })
      .from(imports)
      .where(
        and(
          eq(imports.userId, userId),
          eq(imports.fileHash, fileHash),
          eq(imports.status, "completed"),
        ),
      )
      .limit(1);
    if (priorByHash.length > 0) {
      return {
        ...emptySummary(bank, { warnings: parsed.warnings }),
        alreadyImported: true,
        accountLast4: parsed.accountLast4,
        dateRange: parsed.dateRange,
        parsed: parsed.transactions.length,
        importId: priorByHash[0].id,
      };
    }

    // TDB "Зээлийн дансны хуулга" rows carry raw.template='loan' →
    // the account is a credit (loan) account, not checking.
    const isLoan = parsed.transactions.some(
      (t) => (t.raw as { template?: string }).template === "loan",
    );

    // Resolve / create the bank account (one per user+bank+last4).
    const last4 = parsed.accountLast4 ?? null;
    const existing = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.bank, BANK_ENUM[bank]),
          last4 === null
            ? isNull(accounts.accountLast4)
            : eq(accounts.accountLast4, last4),
        ),
      )
      .limit(1);

    let accountId: string;
    if (existing.length > 0) {
      accountId = existing[0].id;
      // A statement may reveal an existing account is a loan account.
      if (isLoan) {
        await tx
          .update(accounts)
          .set({ accountType: "credit" })
          .where(eq(accounts.id, accountId));
      }
    } else {
      const [created] = await tx
        .insert(accounts)
        .values({
          userId,
          bank: BANK_ENUM[bank],
          accountLast4: last4,
          accountType: isLoan ? "credit" : "checking",
          name: last4
            ? `${BANK_LABEL[bank]} ••••${last4}`
            : BANK_LABEL[bank],
        })
        .returning({ id: accounts.id });
      accountId = created.id;
    }

    // System categories: name|type → id.
    const sysCats = await tx
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
      })
      .from(categories)
      .where(
        and(
          isNull(categories.userId),
          eq(categories.isSystem, true),
          isNull(categories.deletedAt),
        ),
      );
    const catMap = new Map(
      sysCats.map((c) => [`${c.name}␟${c.type}`, c.id]),
    );

    const [imp] = await tx
      .insert(imports)
      .values({
        userId,
        accountId,
        source: "file_upload",
        bank: BANK_ENUM[bank],
        fileName: filename,
        fileType,
        fileSize: file.length,
        fileHash,
        status: "processing",
        totalRows: parsed.transactions.length,
        dateRangeStart: parsed.dateRange?.start ?? null,
        dateRangeEnd: parsed.dateRange?.end ?? null,
        startedAt: new Date(),
      })
      .returning({ id: imports.id });

    const tally = new Map<string | null, CategoryTally>();
    let uncategorized = 0;

    const rows = parsed.transactions.map((t) => {
      const c = categorize({
        description: t.description,
        amount: t.amount,
        type: t.type,
      });
      const categoryId =
        (c.category && catMap.get(`${c.category}␟${c.resolvedType}`)) ||
        null;
      if (c.source === "uncategorized" || !categoryId) uncategorized += 1;

      const key = c.category ?? null;
      const agg = tally.get(key) ?? { category: key, count: 0, amount: 0 };
      agg.count += 1;
      agg.amount += t.amount;
      tally.set(key, agg);

      return {
        userId,
        accountId,
        categoryId,
        importId: imp.id,
        type: c.resolvedType,
        amount: t.amount.toFixed(2),
        balanceAfter:
          t.balanceAfter != null ? t.balanceAfter.toFixed(2) : null,
        currency:
          typeof t.raw.currency === "string" ? t.raw.currency : "MNT",
        description: t.description,
        date: t.date,
        time: t.time ?? null,
        bankRef: t.bankRef ?? null,
        rawData: t.raw,
        dedupHash: computeDedupHash({
          accountId,
          date: t.date,
          amount: t.amount,
          description: t.description,
          bankRef: t.bankRef,
        }),
        categorySource:
          categoryId && c.source === "rule"
            ? ("rule" as const)
            : ("manual" as const),
      };
    });

    const inserted = await tx
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({
        target: [transactions.accountId, transactions.dedupHash],
      })
      .returning({ id: transactions.id });

    const importedRows = inserted.length;
    const duplicateRows = rows.length - importedRows;
    const skippedRows = parsed.errors.length;

    await tx
      .update(imports)
      .set({
        status: skippedRows > 0 ? "partial" : "completed",
        importedRows,
        duplicateRows,
        skippedRows,
        completedAt: new Date(),
      })
      .where(eq(imports.id, imp.id));

    return {
      ok: true,
      alreadyImported: false,
      bank,
      accountLast4: parsed.accountLast4,
      accountId,
      importId: imp.id,
      dateRange: parsed.dateRange,
      parsed: rows.length,
      imported: importedRows,
      duplicates: duplicateRows,
      skipped: skippedRows,
      uncategorized,
      byCategory: [...tally.values()].sort((a, b) => b.count - a.count),
      warnings: parsed.warnings,
      errors: parsed.errors.map((e) => `мөр ${e.row}: ${e.message}`),
    };
  });
}

function emptySummary(
  bank: BankKey,
  extra: Partial<ImportSummary> = {},
): ImportSummary {
  return {
    ok: false,
    alreadyImported: false,
    bank,
    dateRange: null,
    parsed: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    uncategorized: 0,
    byCategory: [],
    warnings: [],
    errors: [],
    ...extra,
  };
}
