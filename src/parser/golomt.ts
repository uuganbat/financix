/**
 * Golomt Bank statement parser (SRS §4.2).
 *
 * Golomt's "ДАНСНЫ ХУУЛГА" export is a JasperReports-generated .xlsx
 * (single sheet `OperativeAccountStatement`, inline strings, no
 * sharedStrings, bogus `dimension="A1"`). Layout:
 *
 *   row 1   F=Хуулганы огноо            H=<statement date>
 *   row 2   A=ДАНСНЫ ХУУЛГА
 *   row 3   B=Дансны дугаар  C=<acct> [CCY]  D=IBAN  F=<iban>
 *   row 4   B=Харилцагчийн нэр C=<name> D=Гүйлгээний огноо F=<from> - <to>
 *   row 5   B=Эхний үлдэгдэл  C=<opening balance>
 *   row 6   B=Гүйлгээний огноо C=Гүйлгээний утга D=Харьцсан дансны нэр
 *           E=Харьцсан данс F=Ханш G=Орлого H=Зарлага   ← header
 *   row 7.. transactions (ISO datetime in B, exactly one of G/H set)
 *   tail    D=Нийт орлого / Нийт зарлага / Эцсийн үлдэгдэл  ← footer totals
 *
 * Pure module: no DB access. Dedup/categorization/persistence are
 * downstream in the import service.
 */

import ExcelJS from "exceljs";
import type { BankParser, ParseResult, ParsedTransaction } from "./types";

const SHEET_NAME = "OperativeAccountStatement";
const FOOTER_INCOME = "Нийт орлого";
const FOOTER_EXPENSE = "Нийт зарлага";
const FOOTER_CLOSING = "Эцсийн үлдэгдэл";

/** "2025-05-04T12:59:04" or "2025-05-05T15:50" (seconds optional). */
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

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
  const s = cellText(v).replace(/[,\s ]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

async function loadSheet(file: Buffer): Promise<ExcelJS.Worksheet | null> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts Node Buffer for .load()
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  return wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0] ?? null;
}

export const golomtParser: BankParser = {
  bank: "golomt",
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
        const b = cellText(row.getCell("B").value);
        const c = cellText(row.getCell("C").value);
        if (a.includes("ДАНСНЫ ХУУЛГА")) hit = true;
        if (b === "Гүйлгээний огноо" && c === "Гүйлгээний утга") hit = true;
      });
      return hit;
    } catch {
      return false;
    }
  },

  async parse(file: Buffer, filename: string): Promise<ParseResult> {
    const result: ParseResult = {
      success: false,
      bank: "golomt",
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
    let openingBalance: number | null = null;
    let metaCurrency = "MNT";
    let headerRow = -1;
    for (const [n, c] of rows) {
      if (c.B === "Дансны дугаар") {
        const m = c.C.match(/\[([A-Z]{3})\]/);
        if (m) metaCurrency = m[1];
        const digits = c.C.replace(/\D/g, "");
        if (digits.length >= 4) {
          result.accountLast4 = digits.slice(-4);
        }
      }
      if (c.B === "Эхний үлдэгдэл") {
        openingBalance = cellNumber(c.C);
      }
      if (c.B === "Гүйлгээний огноо" && c.C === "Гүйлгээний утга") {
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
        `Данс ${metaCurrency} валюттай — дүнг хөрвүүлээгүй (Ханш баганыг raw-д хадгалсан)`,
      );
    }

    // --- Pass 2: transactions, until footer totals ---
    let footerIncome: number | null = null;
    let footerExpense: number | null = null;
    let closingBalance: number | null = null;

    const sortedRowNums = [...rows.keys()].sort((a, b) => a - b);
    for (const n of sortedRowNums) {
      if (n <= headerRow) continue;
      const c = rows.get(n)!;

      // Footer totals: labelled in column D, value in column F.
      if (c.D === FOOTER_INCOME) {
        footerIncome = cellNumber(c.F);
        continue;
      }
      if (c.D === FOOTER_EXPENSE) {
        footerExpense = cellNumber(c.F);
        continue;
      }
      if (c.D === FOOTER_CLOSING) {
        closingBalance = cellNumber(c.F);
        continue;
      }

      const dt = c.B.match(DATETIME_RE);
      if (!dt) {
        // Blank/structural row inside the body — skip silently; a row
        // with content but no datetime is a real anomaly.
        if (c.C || c.G || c.H) {
          result.errors.push({
            row: n,
            message: `Огноо танигдсангүй: "${c.B}"`,
          });
        }
        continue;
      }

      const [, y, mo, d, hh, mm, ss] = dt;
      const date = `${y}-${mo}-${d}`;
      const time = `${hh}:${mm}:${ss ?? "00"}`;

      const income = cellNumber(c.G);
      const expense = cellNumber(c.H);
      let type: ParsedTransaction["type"];
      let amount: number;
      if (income != null && income !== 0) {
        type = "income";
        amount = Math.abs(income);
      } else if (expense != null && expense !== 0) {
        type = "expense";
        amount = Math.abs(expense);
      } else {
        result.errors.push({
          row: n,
          message: "Орлого/зарлагын дүн алга",
        });
        continue;
      }

      const counterparty = c.D || undefined;
      const txn: ParsedTransaction = {
        date,
        time,
        description: c.C,
        amount,
        type,
        counterparty,
        raw: {
          rowNumber: n,
          datetime: c.B,
          description: c.C,
          counterpartyName: c.D || null,
          counterpartyAccount: c.E || null,
          fxRate: cellNumber(c.F),
          income,
          expense,
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

    void filename;
    return result;
  },
};
