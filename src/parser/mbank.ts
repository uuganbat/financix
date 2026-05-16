/**
 * MBank statement parser (SRS §4.2).
 *
 * MBank's "ДАНСНЫ ХУУЛГА" is an Oracle BI Publisher legacy `.xls`
 * (sheets `Statement` + `XDO_METADATA`). Layout of `Statement`:
 *
 *   row 0  B/C/D=period dates  G=Хуулга авсан огноо
 *   row 1  A=ДАНСНЫ ХУУЛГА
 *   row 2  A=Дансны дугаар   D=<acct> <CCY>
 *   row 3  A=Данс эзэмшигчийн нэр  D=<name>
 *   row 4  A=№ B=Гүйлгээний огноо C=Гүйлгээний дугаар D=Гүйлгээний утга
 *          F=Харьцсан данс G=Орлого H=Зарлага I=Үлдэгдэл   ← header
 *   row 5… transactions (A = running index)
 *   tail   F=Нийт орлого / Нийт зарлага / Эхний/Эцсийн үлдэгдэл
 *
 * Pure module: no DB access.
 */

import type { BankParser, ParseResult, ParsedTransaction } from "./types";
import { looksLikeXls, num, readWorkbook, text } from "./xls";

const SHEET = "Statement";
// Statement column indices (0-based).
const C_IDX = 0; // № / footer labels live in F though
const C_DATETIME = 1; // "2025-10-24 13:03:20"
const C_REF = 2; // "2025-10-24 SMB323394"
const C_DESC = 3; // Гүйлгээний утга
const C_CP_ACCT = 5; // Харьцсан данс
const C_INCOME = 6; // Орлого
const C_EXPENSE = 7; // Зарлага
const C_BALANCE = 8; // Үлдэгдэл (running)
const C_FOOTER_LABEL = 5; // footer label sits in F
const C_FOOTER_VALUE = 6; // footer value in G

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export const mbankParser: BankParser = {
  bank: "mbank",
  supportedFormats: ["xls"],

  async detect(file: Buffer, filename: string): Promise<boolean> {
    if (!looksLikeXls(file, filename)) return false;
    try {
      const wb = readWorkbook(file);
      // XDO_METADATA + Statement is a unique Oracle-BIP/MBank signature.
      if (
        wb.sheetNames.includes("XDO_METADATA") &&
        wb.sheetNames.includes(SHEET)
      ) {
        return true;
      }
      if (!wb.sheetNames.includes(SHEET)) return false;
      const g = wb.grid(SHEET);
      return g
        .slice(0, 6)
        .some(
          (r) =>
            text(r?.[C_IDX]).includes("ДАНСНЫ ХУУЛГА") ||
            (text(r?.[C_DATETIME]) === "Гүйлгээний огноо" &&
              text(r?.[C_REF]) === "Гүйлгээний дугаар"),
        );
    } catch {
      return false;
    }
  },

  async parse(file: Buffer, filename: string): Promise<ParseResult> {
    const result: ParseResult = {
      success: false,
      bank: "mbank",
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
      result.errors.push({ row: 0, message: "Statement хуудас хоосон" });
      return result;
    }

    // Metadata + header location.
    let metaCurrency = "MNT";
    let headerRow = -1;
    for (let i = 0; i < Math.min(grid.length, 12); i++) {
      const r = grid[i];
      if (text(r?.[C_IDX]) === "Дансны дугаар") {
        const acct = text(r?.[C_DESC]); // "8000190102 MNT"
        const m = acct.match(/\b([A-Z]{3})\b/);
        if (m) metaCurrency = m[1];
        const digits = acct.replace(/\D/g, "");
        if (digits.length >= 4) result.accountLast4 = digits.slice(-4);
      }
      if (
        text(r?.[C_IDX]) === "№" &&
        text(r?.[C_DATETIME]) === "Гүйлгээний огноо"
      ) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) {
      result.errors.push({ row: 0, message: "Хүснэгтийн толгой олдсонгүй" });
      return result;
    }
    if (!result.accountLast4) {
      result.warnings.push("Дансны дугаар олдсонгүй — accountLast4 хоосон");
    }

    let footerIncome: number | null = null;
    let footerExpense: number | null = null;

    for (let i = headerRow + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r) continue;
      const label = text(r[C_FOOTER_LABEL]);
      if (label === "Нийт орлого") {
        footerIncome = num(r[C_FOOTER_VALUE]);
        continue;
      }
      if (label === "Нийт зарлага") {
        footerExpense = num(r[C_FOOTER_VALUE]);
        continue;
      }
      if (label === "Эхний үлдэгдэл" || label === "Эцсийн үлдэгдэл") {
        continue; // MBank's opening/closing footer is account-scoped, skip
      }

      const dtRaw = text(r[C_DATETIME]);
      const dt = dtRaw.match(DT_RE);
      if (!dt) {
        if (text(r[C_DESC]) || num(r[C_INCOME]) || num(r[C_EXPENSE])) {
          result.errors.push({
            row: i + 1,
            message: `Огноо танигдсангүй: "${dtRaw}"`,
          });
        }
        continue;
      }
      const [, y, mo, d, hh, mm, ss] = dt;
      const date = `${y}-${mo}-${d}`;
      const time = `${hh}:${mm}:${ss ?? "00"}`;

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
        continue; // zero-value adjustment row
      }

      const refRaw = text(r[C_REF]); // "2025-10-24 SMB323394"
      const bankRef = refRaw.split(/\s+/).pop() || undefined;

      result.transactions.push({
        date,
        time,
        description: text(r[C_DESC]),
        amount,
        type,
        balanceAfter: num(r[C_BALANCE]) ?? undefined,
        bankRef,
        raw: {
          rowNumber: i + 1,
          datetime: dtRaw,
          ref: refRaw,
          description: text(r[C_DESC]),
          counterpartyAccount: text(r[C_CP_ACCT]) || null,
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

    result.success = txns.length > 0;
    if (txns.length === 0) {
      result.errors.push({ row: 0, message: "Гүйлгээ олдсонгүй" });
    }
    void filename;
    return result;
  },
};
