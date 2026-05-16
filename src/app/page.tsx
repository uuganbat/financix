import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDashboard } from "@/dashboard/queries";
import { AppShell } from "./_components/app-shell";

const tug = (n: number) =>
  `${Math.round(n).toLocaleString("en-US")}₮`;

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getDashboard(session.user.id);
  const empty = data.totals.count === 0;

  const expenseCats = data.categories
    .filter((c) => c.type === "expense")
    .slice(0, 8);
  const maxCat = Math.max(1, ...expenseCats.map((c) => c.amount));

  return (
    <AppShell current="dashboard" email={session.user.email}>
      {empty ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Summary */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Орлого">
              <span className="text-positive">{tug(data.totals.income)}</span>
            </Card>
            <Card label="Зарлага">
              <span className="text-negative">
                {tug(data.totals.expense)}
              </span>
            </Card>
            <Card label="Цэвэр">
              <span
                className={
                  data.totals.net >= 0 ? "text-positive" : "text-negative"
                }
              >
                {tug(data.totals.net)}
              </span>
            </Card>
            <Card label="Гүйлгээ">{data.totals.count}</Card>
          </section>

          {/* Banks */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">
              Банкаар ({data.banks.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.banks.map((b) => (
                <div
                  key={b.bank}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-semibold">{b.label}</h3>
                    <span className="text-xs text-muted">
                      {b.count} гүйлгээ
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-positive">+{tug(b.income)}</span>
                    <span className="text-negative">−{tug(b.expense)}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-t border-border pt-3">
                    {b.accounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted">
                          {a.accountLast4
                            ? `••••${a.accountLast4}`
                            : a.name}
                          {a.start && (
                            <span className="ml-2 text-xs text-muted/70">
                              {a.start} … {a.end}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums text-muted">
                          {a.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Category breakdown */}
          {expenseCats.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted">
                Зарлагын ангилал
              </h2>
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
                {expenseCats.map((c) => (
                  <div
                    key={c.name ?? "—"}
                    className="flex items-center gap-3"
                  >
                    <span className="w-32 shrink-0 truncate text-sm">
                      {c.name ?? "Ангилаагүй"}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(c.amount / maxCat) * 100}%`,
                          background: c.color ?? "var(--accent)",
                        }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums text-muted">
                      {tug(c.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted">
              Сүүлийн гүйлгээ
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <tbody>
                  {data.recent.map((t, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {t.date}
                      </td>
                      <td className="max-w-[1px] truncate px-4 py-3">
                        {t.description}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {t.category ?? "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums ${
                          t.type === "income"
                            ? "text-positive"
                            : t.type === "expense"
                              ? "text-negative"
                              : "text-muted"
                        }`}
                      >
                        {t.type === "income"
                          ? "+"
                          : t.type === "expense"
                            ? "−"
                            : ""}
                        {tug(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Card({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{children}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface py-24 text-center">
      <h1 className="text-2xl font-semibold">Хараахан өгөгдөл алга</h1>
      <p className="max-w-sm text-sm text-muted">
        Голомт, М банк, ХХБ-ийн хуулга оруулбал энд банкаар ялгасан
        тойм, ангилал, гүйлгээ харагдана.
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
