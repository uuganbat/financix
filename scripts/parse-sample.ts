/**
 * Dogfood: parse a real bank statement and show categorization.
 *
 *   npx tsx scripts/parse-sample.ts [path/to/statement.xlsx]
 *
 * With no argument it picks the first non-README file in samples/.
 * Reads only — never writes to the DB. Real statements are PII and
 * gitignored; this just proves the parse → categorize loop on them.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { detectParser } from "../src/parser";
import { categorize } from "../src/categorizer";

function pickSample(): string {
  const argPath = process.argv[2];
  if (argPath) return argPath;
  const dir = "samples";
  const file = readdirSync(dir).find(
    (f) => f !== "README.md" && !f.startsWith("."),
  );
  if (!file) {
    console.error("samples/ хоосон байна — хуулгын файл байршуулна уу.");
    process.exit(1);
  }
  return join(dir, file);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function main() {
  const path = pickSample();
  const buf = readFileSync(path);
  console.log(`Файл: ${path} (${buf.length.toLocaleString()} bytes)\n`);

  const parser = await detectParser(buf as Buffer, path);
  if (!parser) {
    console.error("Тохирох parser олдсонгүй.");
    process.exit(1);
  }
  console.log(`Танигдсан банк: ${parser.bank}`);

  const r = await parser.parse(buf as Buffer, path);
  console.log(
    `success=${r.success}  accountLast4=${r.accountLast4 ?? "—"}  ` +
      `огноо=${r.dateRange ? `${r.dateRange.start}…${r.dateRange.end}` : "—"}`,
  );
  console.log(
    `Гүйлгээ: ${r.summary.count}  ` +
      `орлого=${fmt(r.summary.totalIncome)}  ` +
      `зарлага=${fmt(r.summary.totalExpense)}`,
  );
  if (r.errors.length) {
    console.log(`\nАлдаа (${r.errors.length}):`);
    for (const e of r.errors.slice(0, 10)) {
      console.log(`  row ${e.row}: ${e.message}`);
    }
  }
  if (r.warnings.length) {
    console.log(`\nСануулга (${r.warnings.length}):`);
    for (const w of r.warnings) console.log(`  • ${w}`);
  }

  // --- Categorize ---
  type Bucket = { count: number; amount: number };
  const byCat = new Map<string, Bucket>();
  const uncategorized: { desc: string; amount: number }[] = [];

  for (const t of r.transactions) {
    const c = categorize({
      description: t.description,
      amount: t.amount,
      type: t.type,
    });
    const key =
      c.category ?? `(ангилагдаагүй · ${c.resolvedType})`;
    const b = byCat.get(key) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += t.amount;
    byCat.set(key, b);
    if (c.source === "uncategorized") {
      uncategorized.push({ desc: t.description, amount: t.amount });
    }
  }

  console.log("\nАнгилал:");
  const sorted = [...byCat.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );
  for (const [cat, b] of sorted) {
    console.log(
      `  ${cat.padEnd(34)} ${String(b.count).padStart(4)} ` +
        `гүйлгээ  ${fmt(b.amount).padStart(16)}`,
    );
  }

  const pct = r.transactions.length
    ? ((uncategorized.length / r.transactions.length) * 100).toFixed(1)
    : "0";
  console.log(
    `\nАнгилагдаагүй: ${uncategorized.length}/${r.transactions.length} (${pct}%)`,
  );

  // Most common uncategorized descriptions — the rule/AI gap.
  const freq = new Map<string, number>();
  for (const u of uncategorized) {
    const norm = u.desc.replace(/\d+/g, "#").trim().slice(0, 60);
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  }
  const topGaps = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (topGaps.length) {
    console.log("\nАнгилагдаагүй түгээмэл утга (дүрэм/AI-н цоорхой):");
    for (const [d, n] of topGaps) {
      console.log(`  ${String(n).padStart(3)}×  ${d}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
