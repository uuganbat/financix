"use client";

import { useState } from "react";
import type { ImportSummary } from "@/import/service";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/import", { method: "POST", body });
    const data = await res.json();
    setPending(false);

    if (!res.ok && !("parsed" in data)) {
      setError(data.error ?? "Импорт амжилтгүй боллоо.");
      return;
    }
    setResult(data as ImportSummary);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-black"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Хуулга импортлох
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Голомт (.xlsx), М банк / ХХБ (.xls) хуулгын файл дэмжигдэнэ.
        </p>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-4 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-background"
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={!file || pending}
          className="h-11 w-fit rounded-full bg-foreground px-6 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
        >
          {pending ? "Боловсруулж байна…" : "Импортлох"}
        </button>
      </form>

      {result && <Results r={result} />}
    </div>
  );
}

function Results({ r }: { r: ImportSummary }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-8 text-sm dark:border-white/[.145] dark:bg-black">
      {r.alreadyImported && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Энэ файлыг өмнө нь импортолсон байна — давхардлыг алгассан.
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-zinc-700 dark:text-zinc-300">
        <span>
          Банк: <b>{r.bank}</b>
          {r.accountLast4 ? ` ••••${r.accountLast4}` : ""}
        </span>
        {r.dateRange && (
          <span>
            Хугацаа: {r.dateRange.start} … {r.dateRange.end}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Уншсан" value={r.parsed} />
        <Stat label="Нэмсэн" value={r.imported} accent="text-green-600" />
        <Stat label="Давхардсан" value={r.duplicates} />
        <Stat label="Алгассан" value={r.skipped} />
        <Stat label="Ангилаагүй" value={r.uncategorized} />
      </div>

      {r.byCategory.length > 0 && (
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-black dark:text-zinc-50">
            Ангилал
          </h2>
          <table className="w-full text-left">
            <tbody>
              {r.byCategory.map((c) => (
                <tr
                  key={c.category ?? "—"}
                  className="border-b border-black/[.06] last:border-0 dark:border-white/[.08]"
                >
                  <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                    {c.category ?? "Ангилаагүй"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {c.count}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {fmt(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.warnings.length > 0 && (
        <details className="text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer">
            Сануулга ({r.warnings.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {r.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {r.errors.length > 0 && (
        <details className="text-red-600 dark:text-red-400">
          <summary className="cursor-pointer">
            Алдаа ({r.errors.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {r.errors.slice(0, 20).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg bg-black/[.03] px-3 py-2 dark:bg-white/[.05]">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${accent ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
