/**
 * Transactions read model (server-only). Lists a user's transactions
 * with their bank (account join) and current category, paginated.
 * Amounts cast to float8 so postgres-js returns numbers, not numeric
 * strings. Soft-deleted rows excluded. BANK_LABEL is reused from the
 * dashboard read model — single source (still duplicated in
 * import/service.ts; dedupe later).
 */

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { BANK_LABEL } from "@/dashboard/queries";

export const PAGE_SIZE = 50;

export type TxnRow = {
  id: string;
  date: string;
  time: string | null;
  description: string;
  amount: number;
  type: string;
  bank: string;
  bankLabel: string;
  accountLast4: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categorySource: string;
};

export type CategoryOption = {
  id: string;
  name: string;
  color: string | null;
  type: string;
};

export type TxnPage = {
  rows: TxnRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listTransactions(
  userId: string,
  page: number,
): Promise<TxnPage> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * PAGE_SIZE;
  const scope = and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  );

  const [rows, countRow] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        time: transactions.time,
        description: transactions.description,
        amount: sql<number>`${transactions.amount}::float8`,
        type: transactions.type,
        bank: accounts.bank,
        accountLast4: accounts.accountLast4,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(scope)
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(scope),
  ]);

  const total = countRow[0]?.n ?? 0;
  return {
    rows: rows.map((r) => ({
      ...r,
      bankLabel: BANK_LABEL[r.bank] ?? r.bank,
    })),
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** System defaults (user_id IS NULL) + this user's own categories. */
export async function listCategoryOptions(
  userId: string,
): Promise<CategoryOption[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      type: categories.type,
    })
    .from(categories)
    .where(
      and(
        isNull(categories.deletedAt),
        or(isNull(categories.userId), eq(categories.userId, userId)),
      ),
    )
    .orderBy(categories.type, categories.sortOrder, categories.name);
}
