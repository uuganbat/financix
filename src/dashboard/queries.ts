/**
 * Dashboard read model (server-only). One query per panel, run in
 * parallel. Amounts are cast to float8 in SQL so postgres-js returns
 * numbers, not numeric strings. Soft-deleted rows are excluded.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";

export const BANK_LABEL: Record<string, string> = {
  golomt: "Голомт банк",
  khan: "Хаан банк",
  mbank: "М банк",
  tdb: "ХХБ (TDB)",
  kkb: "Капитрон банк",
  cash: "Бэлэн мөнгө",
  other: "Бусад",
};

export type AccountAgg = {
  id: string;
  name: string;
  accountLast4: string | null;
  count: number;
  income: number;
  expense: number;
  start: string | null;
  end: string | null;
};

export type BankGroup = {
  bank: string;
  label: string;
  income: number;
  expense: number;
  count: number;
  accounts: AccountAgg[];
};

export type CategorySlice = {
  name: string | null;
  color: string | null;
  type: string;
  count: number;
  amount: number;
};

export type RecentTxn = {
  date: string;
  time: string | null;
  description: string;
  amount: number;
  type: string;
  bank: string;
  accountLast4: string | null;
  category: string | null;
  categoryColor: string | null;
};

export type DashboardData = {
  totals: { count: number; income: number; expense: number; net: number };
  banks: BankGroup[];
  categories: CategorySlice[];
  recent: RecentTxn[];
};

export async function getDashboard(userId: string): Promise<DashboardData> {
  const income = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)::float8`;
  const expense = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)::float8`;

  const [totalsRow, accountRows, categoryRows, recentRows] =
    await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
          income,
          expense,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        ),

      db
        .select({
          id: accounts.id,
          name: accounts.name,
          bank: accounts.bank,
          accountLast4: accounts.accountLast4,
          count: sql<number>`count(${transactions.id})::int`,
          income,
          expense,
          start: sql<string | null>`min(${transactions.date})`,
          end: sql<string | null>`max(${transactions.date})`,
        })
        .from(accounts)
        .leftJoin(
          transactions,
          and(
            eq(transactions.accountId, accounts.id),
            isNull(transactions.deletedAt),
          ),
        )
        .where(
          and(eq(accounts.userId, userId), isNull(accounts.deletedAt)),
        )
        .groupBy(accounts.id)
        .orderBy(accounts.bank, accounts.name),

      db
        .select({
          name: categories.name,
          color: categories.color,
          type: transactions.type,
          count: sql<number>`count(*)::int`,
          amount: sql<number>`coalesce(sum(${transactions.amount}), 0)::float8`,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        )
        .groupBy(categories.name, categories.color, transactions.type)
        .orderBy(sql`3 desc nulls last`),

      db
        .select({
          date: transactions.date,
          time: transactions.time,
          description: transactions.description,
          amount: sql<number>`${transactions.amount}::float8`,
          type: transactions.type,
          bank: accounts.bank,
          accountLast4: accounts.accountLast4,
          category: categories.name,
          categoryColor: categories.color,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(30),
    ]);

  const t = totalsRow[0] ?? { count: 0, income: 0, expense: 0 };

  // Fold per-account rows into bank groups.
  const groups = new Map<string, BankGroup>();
  for (const r of accountRows) {
    let g = groups.get(r.bank);
    if (!g) {
      g = {
        bank: r.bank,
        label: BANK_LABEL[r.bank] ?? r.bank,
        income: 0,
        expense: 0,
        count: 0,
        accounts: [],
      };
      groups.set(r.bank, g);
    }
    g.income += r.income;
    g.expense += r.expense;
    g.count += r.count;
    g.accounts.push({
      id: r.id,
      name: r.name,
      accountLast4: r.accountLast4,
      count: r.count,
      income: r.income,
      expense: r.expense,
      start: r.start,
      end: r.end,
    });
  }

  return {
    totals: {
      count: t.count,
      income: t.income,
      expense: t.expense,
      net: t.income - t.expense,
    },
    banks: [...groups.values()].sort((a, b) => b.count - a.count),
    categories: categoryRows,
    recent: recentRows,
  };
}
