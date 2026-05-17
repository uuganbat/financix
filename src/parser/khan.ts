/**
 * Khan Bank statement parser (SRS §4.2).
 *
 * Khan's "Депозит дансны дэлгэрэнгүй хуулга" export is a plain OOXML
 * .xlsx (single sheet `Deposit Account Statement`). Layout:
 *
 *   row 1   G=Printed Date:        H=<statement date>
 *   row 2-3 C..F = title (merged)
 *   row 4-5 A=Хэрэглэгч:  D=<name>  G=Интервал: <from>-<to>
 *   row 6-7 A=Дансны дугаар:  D=<account number>
 *   row 8   A=Гүйлгээний огноо B=Салбар C=Эхний үлдэгдэл
 *           D=Дебит гүйлгээ E=Кредит гүйлгээ F=Эцсийн үлдэгдэл
 *           G=Гүйлгээний утга H=Харьцсан данс            ← header
 *   row 9.. transactions (datetime in A; debit D negative OR credit E)
 *   tail    A=Нийт дүн:  D=<total debit>  E=<total credit>  ← footer
 *
 * Debit (D) is money out → expense (stored negative in the sheet);
 * Credit (E) is money in → income. Pure module: no DB access.
 */

import ExcelJS from "exceljs";
import type { BankParser, ParseResult, ParsedTransaction } from "./types";

const SHEET_NAME = "Deposit Account Statement";
const HEADER_DATE = "Гүйлгээний огноо";
const HEADER_OPENING = "Эхний үлдэгдэл";
const ACCOUNT_LABEL = "Дансны дугаар";
const FOOTER_TOTAL = "Нийт дүн";

/** "2026-02-03 17:04:29" (space or T, seconds optional). */
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function looksLikeXlsx(file: Buffer, filename: string): boolean {
  const zipSig =
    file.length > 4 &&
    file[0] === 0x50 &&
    file[1] === 0x4b &&
    (file[2] === 0x03 || file[2] === 0x05 || file[2] === 0x07);
  return zipSig || filename.toLowerCase().endsWith(".xlsx");
}

/** Coerce any ExcelJS cell value to trimmed text. */
function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>)
        .map((r) => r.text ?? "")
        .join("")
        .trim();
    }
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if (typeof o.error === "string") return "";
  }
  return String(v).trim();
}

/** Numeric cell, tolerant of thousands separators / stray spaces. */
function cellNumber(v: ExcelJS.CellValue | undefined): number | null {
  const s = cellText(v).replace(/[,\s ]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/** Statement_MNT_5429484546.xlsx → "MNT" (default MNT). */
function currencyFromName(filename: string): string {
  const m = filename.toUpperCase().match(/[_-]([A-Z]{3})[_-]/);
  return m ? m[1] : "MNT";
}

async function loadSheet(file: Buffer): Promise<ExcelJS.Worksheet | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  return wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0] ?? null;
}

export const khanParser: BankParser = {
  bank: "khan",
  supportedFormats: ["xlsx"],

  async detect(file: Buffer, filename: string): Promise<boolean> {
    if (!looksLikeXlsx(file, filename)) return false;
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file as unknown as ArrayBuffer);
      if (wb.getWorksheet(SHEET_NAME)) return true;
      const ws = wb.worksheets[0];
      if (!ws) return false;
      let hit = false;
      ws.eachRow({ includeEmpty: false }, (row) => {
        const a = cellText(row.getCell("A").value);
        const c = cellText(row.getCell("C").value);
        const d = cellText(row.getCell("D").value);
        if (a === HEADER_DATE && c === HEADER_OPENING && d.includes("Дебит")) {
          hit = true;
        }
      });
      return hit;
    } catch {
      return false;
    }
  },

  async parse(file: Buffer, filename: string): Promise<ParseResult> {
    const result: ParseResult = {
      success: false,
      bank: "khan",
      transactions: [],
      dateRange: null,
      summary: { totalIncome: 0, totalExpense: 0, count: 0 },
      errors: [],
      warnings: [],
    };

    let ws: ExcelJS.Worksheet | null;
    try {
      ws = await loadSheet(file);
    } catch (e) {
      result.errors.push({
        row: 0,
        message: `Excel-ийг нээж чадсангүй: ${(e as Error).message}`,
      });
      return result;
    }
    if (!ws) {
      result.errors.push({ row: 0, message: "Ажлын хуудас олдсонгүй" });
      return result;
    }

    // --- Pass 1: snapshot populated rows by row number ---
    type Cells = Record<string, string>;
    const rows = new Map<number, Cells>();
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const c: Cells = {};
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        c[col] = cellText(row.getCell(col).value);
      }
      rows.set(rowNumber, c);
    });

    // --- Metadata + header location ---
    const metaCurrency = currencyFromName(filename);
    let headerRow = -1;
    for (const [n, c] of rows) {
      if (c.A.startsWith(ACCOUNT_LABEL)) {
        const digits = c.D.replace(/\D/g, "");
        if (digits.length >= 4) result.accountLast4 = digits.slice(-4);
      }
      if (c.A === HEADER_DATE && c.C === HEADER_OPENING) {
        headerRow = n;
        break;
      }
    }

    if (headerRow < 0) {
      result.errors.push({
        row: 0,
        message: "Гүйлгээний хүснэгтийн толгой (header) олдсонгүй",
      });
      return result;
    }
    if (!result.accountLast4) {
      result.warnings.push("Дансны дугаар олдсонгүй — accountLast4 хоосон");
    }
    if (metaCurrency !== "MNT") {
      result.warnings.push(
        `Данс ${metaCurrency} валюттай — дүнг хөрвүүлээгүй`,
      );
    }

    // --- Pass 2: transactions, until footer totals ---
    let footerIncome: number | null = null;
    let footerExpense: number | null = null;
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;

    const sortedRowNums = [...rows.keys()].sort((a, b) => a - b);
    for (const n of sortedRowNums) {
      if (n <= headerRow) continue;
      const c = rows.get(n)!;

      // Footer: A="Нийт дүн:"  D=total debit  E=total credit.
      if (c.A.startsWith(FOOTER_TOTAL)) {
        footerExpense = cellNumber(c.D);
        if (footerExpense != null) footerExpense = Math.abs(footerExpense);
        footerIncome = cellNumber(c.E);
        continue;
      }

      const dt = c.A.match(DATETIME_RE);
      if (!dt) {
        // Content with no datetime in col A is a real anomaly; a fully
        // structural/blank row is skipped silently.
        if (c.D || c.E || c.G) {
          result.errors.push({
            row: n,
            message: `Огноо танигдсангүй: "${c.A}"`,
          });
        }
        continue;
      }

      const [, y, mo, d, hh, mm, ss] = dt;
      const date = `${y}-${mo}-${d}`;
      const time = `${hh}:${mm}:${ss ?? "00"}`;

      const debit = cellNumber(c.D); // money out, stored negative
      const credit = cellNumber(c.E); // money in
      let type: ParsedTransaction["type"];
      let amount: number;
      if (credit != null && credit !== 0) {
        type = "income";
        amount = Math.abs(credit);
      } else if (debit != null && debit !== 0) {
        type = "expense";
        amount = Math.abs(debit);
      } else {
        result.errors.push({
          row: n,
          message: "Дебит/кредит дүн алга",
        });
        continue;
      }

      const balanceBefore = cellNumber(c.C);
      const balanceAfter = cellNumber(c.F);
      if (openingBalance == null) openingBalance = balanceBefore;
      if (balanceAfter != null) closingBalance = balanceAfter;

      const txn: ParsedTransaction = {
        date,
        time,
        description: c.G,
        amount,
        type,
        balanceAfter: balanceAfter ?? undefined,
        counterparty: c.H || undefined,
        raw: {
          rowNumber: n,
          datetime: c.A,
          branch: c.B || null,
          balanceBefore,
          debit,
          credit,
          balanceAfter,
          description: c.G,
          counterpartyAccount: c.H || null,
          currency: metaCurrency,
        },
      };
      result.transactions.push(txn);
    }

    // --- Summary + cross-checks ---
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

    return result;
  },
};
