/**
 * TDB (Trade & Development Bank) statement parser (SRS §4.2).
 *
 * TDB exports two Crystal Reports legacy `.xls` templates (single
 * `Sheet1`, OLE2). Crystal merges cells per band, so header-label
 * columns do NOT line up with data columns — data positions are fixed
 * by inspection, per template, not by reading the header row:
 *
 * • "Депозит дансны хуулга" (deposit/checking):
 *     A(0) datetime  E(4) teller  H(7) Орлого  L(11) Зарлага
 *     Q(16) Ханш  V(21) Харьцсан данс  X(23) cp-name  AA(26) Үлдэгдэл
 *     AC(28) утга;  footer A="Нийт:"  G(6) totIn  N(13) totExp
 *
 * • "Зээлийн дансны хуулга" (loan):
 *     B(1) datetime  H(7) teller  N(13) Орлого  S(18) Зарлага
 *     X(23) Үлдэгдэл  AA(26) утга  (no counterparty cols);
 *     footer cell "Нийт" with N(13) totIn / S(18) totExp.
 *   On a loan the running balance moves the OTHER way (Зарлага =
 *   interest capitalised → debt up; Орлого = repayment → debt down),
 *   so the balance identity is inverted: opening − in + out = closing.
 *
 * Statement Орлого/Зарлага columns are recorded faithfully as
 * income/expense; mapping loan flows to personal-finance categories is
 * a downstream concern. Pure module: no DB access.
 */

import type { BankParser, ParseResult, ParsedTransaction } from "./types";
import {
  type Cell,
  dateUTC,
  looksLikeXls,
  num,
  numberInLabel,
  readWorkbook,
  text,
} from "./xls";

const SHEET = "Sheet1";

type Template = "deposit" | "loan";

type Cols = {
  date: number;
  teller: number;
  income: number;
  expense: number;
  balance: number;
  desc: number;
  cpAcct?: number;
  cpName?: number;
  fx?: number;
  footerIncome: number;
  footerExpense: number;
};

const DEPOSIT_COLS: Cols = {
  date: 0,
  teller: 4,
  income: 7,
  expense: 11,
  fx: 16,
  cpAcct: 21,
  cpName: 23,
  balance: 26,
  desc: 28,
  footerIncome: 6,
  footerExpense: 13,
};

const LOAN_COLS: Cols = {
  date: 1,
  teller: 7,
  income: 13,
  expense: 18,
  balance: 23,
  desc: 26,
  footerIncome: 13,
  footerExpense: 18,
};

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/** First numeric cell at an index strictly greater than `after`. */
function numAfter(row: Cell[], after: number): number | null {
  for (let i = after + 1; i < row.length; i++) {
    const n = num(row[i]);
    if (n != null) return n;
  }
  return null;
}

export const tdbParser: BankParser = {
  bank: "tdb",
  supportedFormats: ["xls"],

  async detect(file: Buffer, filename: string): Promise<boolean> {
    if (!looksLikeXls(file, filename)) return false;
    try {
      const wb = readWorkbook(file);
      const g = wb.grid(SHEET);
      return g.slice(0, 15).some((r) => {
        const joined = (r ?? []).map((c) => text(c)).join(" | ");
        return (
          joined.includes("Депозит дансны хуулга") ||
          joined.includes("Зээлийн дансны хуулга") ||
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

    let grid: Cell[][];
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

    const isLoan = grid.slice(0, 15).some((r) =>
      (r ?? []).some((c) => text(c).includes("Зээлийн дансны хуулга")),
    );
    const template: Template = isLoan ? "loan" : "deposit";
    const cols = isLoan ? LOAN_COLS : DEPOSIT_COLS;

    let metaCurrency = "MNT";
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;

    if (template === "deposit") {
      // Header band: labelled cells carry "label: value CCY" in one string.
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
    } else {
      // Loan: label and value live in SEPARATE cells of the same row.
      for (let i = 0; i < Math.min(grid.length, 14); i++) {
        const r = grid[i];
        if (!r) continue;
        r.forEach((cell, idx) => {
          const s = text(cell);
          if (!s) return;
          if (s === "Дансны дугаар") {
            for (let j = idx + 1; j < r.length; j++) {
              const v = text(r[j]);
              if (/^\d{4,}$/.test(v.replace(/\D/g, "")) && !result.accountLast4) {
                const digits = v.replace(/\D/g, "");
                if (digits.length >= 4) result.accountLast4 = digits.slice(-4);
              }
              if (/^[A-Z]{3}$/.test(v)) metaCurrency = v;
            }
          }
          if (s.startsWith("Эхний үлдэгдэл")) {
            openingBalance = numAfter(r, idx);
          }
        });
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

      // Footer totals row.
      const isFooter =
        template === "deposit"
          ? text(r[cols.date]) === "Нийт:"
          : r.some((c) => text(c) === "Нийт");
      if (isFooter) {
        footerIncome = num(r[cols.footerIncome]);
        footerExpense = num(r[cols.footerExpense]);
        if (footerIncome == null || footerExpense == null) {
          const nums = r
            .map((c) => num(c))
            .filter((n): n is number => n != null);
          footerIncome = footerIncome ?? nums[0] ?? null;
          footerExpense = footerExpense ?? nums[1] ?? null;
        }
        continue;
      }
      // Loan closing balance sits in its own labelled row after "Нийт".
      if (
        template === "loan" &&
        closingBalance == null &&
        r.some((c) => text(c).startsWith("Эцсийн үлдэгдэл"))
      ) {
        const idx = r.findIndex((c) =>
          text(c).startsWith("Эцсийн үлдэгдэл"),
        );
        closingBalance = numAfter(r, idx);
        continue;
      }

      const dateCell = r[cols.date];
      if (!(dateCell instanceof Date)) continue; // blank / band row

      const { date, time } = dateUTC(dateCell);
      const income = num(r[cols.income]);
      const expense = num(r[cols.expense]);
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

      const cpName =
        cols.cpName != null ? text(r[cols.cpName]) || undefined : undefined;
      result.transactions.push({
        date,
        time,
        description: text(r[cols.desc]),
        amount,
        type,
        balanceAfter: num(r[cols.balance]) ?? undefined,
        counterparty: cpName,
        raw: {
          rowNumber: i + 1,
          template,
          teller: text(r[cols.teller]) || null,
          description: text(r[cols.desc]),
          counterpartyName:
            cols.cpName != null ? text(r[cols.cpName]) || null : null,
          counterpartyAccount:
            cols.cpAcct != null ? text(r[cols.cpAcct]) || null : null,
          fxRate: cols.fx != null ? num(r[cols.fx]) : null,
          income,
          expense,
          balance: num(r[cols.balance]),
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
    if (openingBalance != null && closingBalance != null) {
      // Deposit: opening + in − out = closing. Loan: debt grows on
      // Зарлага and shrinks on Орлого, so the identity inverts.
      const projected =
        template === "loan"
          ? openingBalance -
            result.summary.totalIncome +
            result.summary.totalExpense
          : openingBalance +
            result.summary.totalIncome -
            result.summary.totalExpense;
      if (!approxEqual(projected, closingBalance)) {
        result.warnings.push(
          `Үлдэгдлийн тэнцэл зөрүүтэй: эхний ${openingBalance}, орлого ${result.summary.totalIncome}, зарлага ${result.summary.totalExpense} ≠ эцсийн ${closingBalance}`,
        );
      }
    }

    result.success = txns.length > 0;
    if (txns.length === 0) {
      result.errors.push({ row: 0, message: "Гүйлгээ олдсонгүй" });
    }
    void filename;
    return result;
  },
};
