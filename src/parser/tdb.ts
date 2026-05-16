/**
 * TDB (Trade & Development Bank) statement parser (SRS §4.2).
 *
 * TDB's "Депозит дансны хуулга" is a Crystal Reports legacy `.xls`
 * (single `Sheet1`, columns up to AE). Crystal merges cells per band,
 * so header-label columns do NOT line up with data columns — data
 * positions are fixed by inspection, not by reading the header row:
 *
 *   A(0)  datetime (Excel date cell; UTC fields = displayed local time)
 *   E(4)  teller            H(7)  Орлого     L(11) Зарлага
 *   Q(16) Ханш              V(21) Харьцсан данс (acct)
 *   X(23) counterparty name AA(26) Үлдэгдэл  AC(28) Гүйлгээний утга
 *   footer row: A="Нийт:"  G(6)=total income  N(13)=total expense
 *
 * Blank spacer rows are interleaved throughout. A row is a transaction
 * iff column A holds a Date. Pure module: no DB access.
 */

import type { BankParser, ParseResult, ParsedTransaction } from "./types";
import {
  dateUTC,
  looksLikeXls,
  num,
  numberInLabel,
  readWorkbook,
  text,
} from "./xls";

const SHEET = "Sheet1";
const C_DATE = 0;
const C_TELLER = 4;
const C_INCOME = 7;
const C_EXPENSE = 11;
const C_FX = 16;
const C_CP_ACCT = 21;
const C_CP_NAME = 23;
const C_BALANCE = 26;
const C_DESC = 28;
const C_FOOTER_INCOME = 6;
const C_FOOTER_EXPENSE = 13;

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export const tdbParser: BankParser = {
  bank: "tdb",
  supportedFormats: ["xls"],

  async detect(file: Buffer, filename: string): Promise<boolean> {
    if (!looksLikeXls(file, filename)) return false;
    try {
      const wb = readWorkbook(file);
      const g = wb.grid(SHEET);
      // Crystal Reports TDB header within the first ~15 rows.
      return g.slice(0, 15).some((r) => {
        const joined = (r ?? []).map((c) => text(c)).join(" | ");
        return (
          joined.includes("Депозит дансны хуулга") ||
          (joined.includes("Теллер") && joined.includes("Харьцсан данс"))
        );
      });
    } catch {
      return false;
    }
  },

  async parse(file: Buffer, filename: string): Promise<ParseResult> {
    const result: ParseResult = {
      success: false,
      bank: "tdb",
      transactions: [],
      dateRange: null,
      summary: { totalIncome: 0, totalExpense: 0, count: 0 },
      errors: [],
      warnings: [],
    };

    let grid;
    try {
      grid = readWorkbook(file).grid(SHEET);
    } catch (e) {
      result.errors.push({
        row: 0,
        message: `Excel-ийг нээж чадсангүй: ${(e as Error).message}`,
      });
      return result;
    }
    if (grid.length === 0) {
      result.errors.push({ row: 0, message: "Sheet1 хоосон" });
      return result;
    }

    // Metadata: scan header band for labelled cells (any column).
    let metaCurrency = "MNT";
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;
    for (let i = 0; i < Math.min(grid.length, 14); i++) {
      for (const cell of grid[i] ?? []) {
        const s = text(cell);
        if (!s) continue;
        if (s.includes("Дансны дугаар")) {
          const tail = s.split(":")[1] ?? s;
          const cm = tail.match(/\b([A-Z]{3})\b/);
          if (cm) metaCurrency = cm[1];
          const digits = tail.replace(/\D/g, "");
          if (digits.length >= 4) result.accountLast4 = digits.slice(-4);
        }
        if (s.includes("Эхний үлдэгдэл")) openingBalance = numberInLabel(s);
        if (s.includes("Эцсийн үлдэгдэл")) closingBalance = numberInLabel(s);
      }
    }
    if (!result.accountLast4) {
      result.warnings.push("Дансны дугаар олдсонгүй — accountLast4 хоосон");
    }

    let footerIncome: number | null = null;
    let footerExpense: number | null = null;

    for (let i = 0; i < grid.length; i++) {
      const r = grid[i];
      if (!r) continue;

      if (text(r[C_DATE]) === "Нийт:") {
        footerIncome = num(r[C_FOOTER_INCOME]);
        footerExpense = num(r[C_FOOTER_EXPENSE]);
        if (footerIncome == null || footerExpense == null) {
          const nums = r
            .map((c) => num(c))
            .filter((n): n is number => n != null);
          footerIncome = footerIncome ?? nums[0] ?? null;
          footerExpense = footerExpense ?? nums[1] ?? null;
        }
        continue;
      }

      const dateCell = r[C_DATE];
      if (!(dateCell instanceof Date)) continue; // blank / band row

      const { date, time } = dateUTC(dateCell);
      const income = num(r[C_INCOME]);
      const expense = num(r[C_EXPENSE]);
      let type: ParsedTransaction["type"];
      let amount: number;
      if (income != null && income !== 0) {
        type = "income";
        amount = Math.abs(income);
      } else if (expense != null && expense !== 0) {
        type = "expense";
        amount = Math.abs(expense);
      } else {
        continue;
      }

      const cpName = text(r[C_CP_NAME]) || undefined;
      result.transactions.push({
        date,
        time,
        description: text(r[C_DESC]),
        amount,
        type,
        balanceAfter: num(r[C_BALANCE]) ?? undefined,
        counterparty: cpName,
        raw: {
          rowNumber: i + 1,
          teller: text(r[C_TELLER]) || null,
          description: text(r[C_DESC]),
          counterpartyName: text(r[C_CP_NAME]) || null,
          counterpartyAccount: text(r[C_CP_ACCT]) || null,
          fxRate: num(r[C_FX]),
          income,
          expense,
          balance: num(r[C_BALANCE]),
          currency: metaCurrency,
        },
      });
    }

    const txns = result.transactions;
    result.summary.count = txns.length;
    result.summary.totalIncome = txns
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    result.summary.totalExpense = txns
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    if (txns.length > 0) {
      const dates = txns.map((t) => t.date).sort();
      result.dateRange = { start: dates[0], end: dates[dates.length - 1] };
    }

    if (
      footerIncome != null &&
      !approxEqual(footerIncome, result.summary.totalIncome)
    ) {
      result.warnings.push(
        `Орлогын нийт зөрүүтэй: тооцсон ${result.summary.totalIncome}, хуулганд ${footerIncome}`,
      );
    }
    if (
      footerExpense != null &&
      !approxEqual(footerExpense, result.summary.totalExpense)
    ) {
      result.warnings.push(
        `Зарлагын нийт зөрүүтэй: тооцсон ${result.summary.totalExpense}, хуулганд ${footerExpense}`,
      );
    }
    if (
      openingBalance != null &&
      closingBalance != null &&
      !approxEqual(
        openingBalance +
          result.summary.totalIncome -
          result.summary.totalExpense,
        closingBalance,
      )
    ) {
      result.warnings.push(
        `Үлдэгдлийн тэнцэл зөрүүтэй: эхний ${openingBalance} + орлого ${result.summary.totalIncome} − зарлага ${result.summary.totalExpense} ≠ эцсийн ${closingBalance}`,
      );
    }

    result.success = txns.length > 0;
    if (txns.length === 0) {
      result.errors.push({ row: 0, message: "Гүйлгээ олдсонгүй" });
    }
    void filename;
    return result;
  },
};
