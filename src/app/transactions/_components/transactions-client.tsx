"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  CategoryOption,
  TxnPage,
  TxnRow,
} from "@/transactions/queries";

const tug = (n: number) => `${Math.round(n).toLocaleString("en-US")}₮`;

const TYPE_ORDER = ["income", "expense", "transfer", "any"] as const;
const TYPE_LABEL: Record<string, string> = {
  income: "Орлого",
  expense: "Зарлага",
  transfer: "Шилжүүлэг",
  any: "Бусад",
};
const SOURCE_LABEL: Record<string, string> = {
  manual: "Гар",
  rule: "Дүрэм",
  ai: "AI",
  shared_cache: "Кэш",
  recurring: "Давтагдах",
};

export function TransactionsClient({
  initial,
  categories,
}: {
  initial: TxnPage;
  categories: CategoryOption[];
}) {
  const [rows, setRows] = useState<TxnRow[]>(initial.rows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byType = new Map<string, CategoryOption[]>();
    for (const c of categories) {
      const list = byType.get(c.type) ?? [];
      list.push(c);
      byType.set(c.type, list);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      type: t,
      label: TYPE_LABEL[t],
      items: byType.get(t)!,
    }));
  }, [categories]);

  async function onChangeCategory(id: string, value: string) {
    const categoryId = value === "" ? null : value;
    const cat = categories.find((c) => c.id === categoryId) ?? null;
    const prev = rows;

    setError(null);
    setSavingId(id);
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? {
              ...r,
              categoryId,
              categoryName: cat?.name ?? null,
              categoryColor: cat?.color ?? null,
              categorySource: "manual",
            }
          : r,
      ),
    );

    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Хадгалж чадсангүй");
      }
    } catch (e) {
      setRows(prev); // rollback
      setError(e instanceof Error ? e.message : "Хадгалж чадсангүй");
    } finally {
      setSavingId(null);
    }
  }

  if (initial.total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface py-24 text-center">
        <h1 className="text-2xl font-semibold">Гүйлгээ алга</h1>
        <p className="max-w-sm text-sm text-muted">
          Хуулга оруулбал гүйлгээнүүд энд банкаар нь харагдаж, гараар
          ангилах боломжтой болно.
        </p>
        <Link
          href="/import"
          className="mt-2 flex h-11 items-center rounded-full bg-accent px-6 font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          Хуулга импортлох →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Гүйлгээ</h1>
        <span className="text-sm text-muted">
          Нийт {initial.total.toLocaleString("en-US")}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Огноо</th>
              <th className="px-4 py-3 font-medium">Банк</th>
              <th className="px-4 py-3 font-medium">Тайлбар</th>
              <th className="px-4 py-3 font-medium">Ангилал</th>
              <th className="px-4 py-3 text-right font-medium">Дүн</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {r.date}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                    {r.bankLabel}
                  </span>
                  {r.accountLast4 && (
                    <span className="ml-1 text-xs text-muted">
                      ••{r.accountLast4}
                    </span>
                  )}
                </td>
                <td className="max-w-[22rem] truncate px-4 py-3">
                  {r.description}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                      style={{
                        background: r.categoryColor ?? "transparent",
                      }}
                    />
                    <select
                      value={r.categoryId ?? ""}
                      disabled={savingId === r.id}
                      onChange={(e) =>
                        onChangeCategory(r.id, e.target.value)
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none transition-colors focus:border-accent disabled:opacity-50"
                    >
                      <option value="">— Ангилаагүй —</option>
                      {grouped.map((g) => (
                        <optgroup key={g.type} label={g.label}>
                          {g.items.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <span className="text-xs text-muted">
                      {SOURCE_LABEL[r.categorySource] ?? ""}
                    </span>
                  </div>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                    r.type === "income"
                      ? "text-positive"
                      : r.type === "expense"
                        ? "text-negative"
                        : "text-muted"
                  }`}
                >
                  {r.type === "income"
                    ? "+"
                    : r.type === "expense"
                      ? "−"
                      : ""}
                  {tug(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {initial.pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <PageLink
            page={initial.page - 1}
            disabled={initial.page <= 1}
          >
            ← Өмнөх
          </PageLink>
          <span className="text-muted">
            {initial.page} / {initial.pageCount}
          </span>
          <PageLink
            page={initial.page + 1}
            disabled={initial.page >= initial.pageCount}
          >
            Дараах →
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-full px-4 py-2 text-muted opacity-40">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/transactions?page=${page}`}
      className="rounded-full border border-border px-4 py-2 transition-colors hover:bg-surface-2"
    >
      {children}
    </Link>
  );
}
