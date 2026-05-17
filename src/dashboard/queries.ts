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

export type AccountBalance = {
  bank: string;
  bankLabel: string;
  last4: string | null;
  balance: number;
  asOf: string;
};

export type BalancesData = {
  cash: AccountBalance[];
  loans: AccountBalance[];
  totalCash: number;
  totalDebt: number;
  interestPaid: number;
  principalPaid: number;
};

export type DashboardData = {
  totals: { count: number; income: number; expense: number; net: number };
  banks: BankGroup[];
  categories: CategorySlice[];
  recent: RecentTxn[];
  balances: BalancesData;
};

export async function getDashboard(userId: string): Promise<DashboardData> {
  const income = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)::float8`;
  const expense = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)::float8`;

  const [
    totalsRow,
    accountRows,
    categoryRows,
    recentRows,
    balanceRows,
    interestRow,
  ] = await Promise.all([
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

      // Latest running balance per account. Tie-break by sheet
      // rowNumber (monotone with the statement's running balance) —
      // a bulk import gives every row the same created_at, so that
      // alone is a non-deterministic ordering key.
      db.execute(sql`
        select distinct on (a.id)
          a.bank,
          a.account_last4 as last4,
          a.account_type as type,
          t.balance_after::float8 as balance,
          t.date as as_of
        from ${accounts} a
        join ${transactions} t
          on t.account_id = a.id
          and t.deleted_at is null
          and t.balance_after is not null
        where a.user_id = ${userId} and a.deleted_at is null
        order by a.id, t.date desc, t.time desc nulls last,
          (t.raw_data->>'rowNumber')::int desc nulls last,
          t.created_at desc
      `),

      // Interest vs principal actually paid on loan (credit) accounts.
      // "хүү … төлөв" = interest paid; "зээл … төлөв" = principal.
      // "хүү … кап" (capitalised) is excluded — it is not a payment.
      db.execute(sql`
        select
          coalesce(sum(t.amount) filter (
            where t.description ilike '%хүү%' and t.description ilike '%төлөв%'
          ), 0)::float8 as interest_paid,
          coalesce(sum(t.amount) filter (
            where t.description ilike '%зээл%' and t.description ilike '%төлөв%'
          ), 0)::float8 as principal_paid
        from ${transactions} t
        join ${accounts} a on a.id = t.account_id
        where t.user_id = ${userId}
          and t.deleted_at is null
          and a.account_type = 'credit'
      `),
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

  // Split accounts into spendable cash vs loan (credit) debt.
  const balRows = balanceRows as unknown as Array<{
    bank: string;
    last4: string | null;
    type: string;
    balance: number;
    as_of: string;
  }>;
  const cash: AccountBalance[] = [];
  const loans: AccountBalance[] = [];
  let totalCash = 0;
  let totalDebt = 0;
  for (const r of balRows) {
    const entry: AccountBalance = {
      bank: r.bank,
      bankLabel: BANK_LABEL[r.bank] ?? r.bank,
      last4: r.last4,
      balance: r.balance,
      asOf: r.as_of,
    };
    if (r.type === "credit") {
      loans.push(entry);
      totalDebt += r.balance;
    } else {
      cash.push(entry);
      totalCash += r.balance;
    }
  }
  cash.sort((a, b) => b.balance - a.balance);
  loans.sort((a, b) => b.balance - a.balance);

  const ir = (interestRow as unknown as Array<{
    interest_paid: number;
    principal_paid: number;
  }>)[0] ?? { interest_paid: 0, principal_paid: 0 };

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
    balances: {
      cash,
      loans,
      totalCash,
      totalDebt,
      interestPaid: ir.interest_paid,
      principalPaid: ir.principal_paid,
    },
  };
}
