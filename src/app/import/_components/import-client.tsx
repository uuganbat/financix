"use client";

import { useState } from "react";
import Link from "next/link";
import type { ImportSummary } from "@/import/service";

const tug = (n: number) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}₮`;

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
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">Хуулга импортлох</h1>
          <p className="mt-1 text-sm text-muted">
            Голомт (.xlsx), М банк / ХХБ (.xls) хуулгын файл дэмжинэ.
            Давхардсан гүйлгээ автоматаар алгасна.
          </p>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center transition-colors hover:border-accent">
          <span className="text-sm font-medium">
            {file ? file.name : "Файл сонгох"}
          </span>
          <span className="text-xs text-muted">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB`
              : ".xlsx, .xls"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>

        {error && <p className="text-sm text-negative">{error}</p>}

        <button
          type="submit"
          disabled={!file || pending}
          className="h-11 w-fit rounded-full bg-accent px-6 font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
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
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 text-sm">
      {r.alreadyImported && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-muted">
          Энэ файлыг өмнө нь импортолсон — давхардлыг алгассан.
        </p>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-1 text-muted">
        <span>
          Банк: <b className="text-foreground">{r.bank}</b>
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
        <Stat label="Нэмсэн" value={r.imported} accent="text-positive" />
        <Stat label="Давхардсан" value={r.duplicates} />
        <Stat label="Алгассан" value={r.skipped} />
        <Stat label="Ангилаагүй" value={r.uncategorized} />
      </div>

      {r.byCategory.length > 0 && (
        <table className="w-full text-left">
          <tbody>
            {r.byCategory.map((c) => (
              <tr
                key={c.category ?? "—"}
                className="border-b border-border last:border-0"
              >
                <td className="py-2 text-muted">
                  {c.category ?? "Ангилаагүй"}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">
                  {c.count}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {tug(c.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {r.warnings.length > 0 && (
        <details className="text-muted">
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
        <details className="text-negative">
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

      <Link
        href="/"
        className="w-fit text-sm font-medium text-accent hover:underline"
      >
        Хяналт самбар руу очих →
      </Link>
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
    <div className="flex flex-col rounded-lg bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${accent ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
