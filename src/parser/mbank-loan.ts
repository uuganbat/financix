/**
 * MBank loan-account statement parser (SRS §4.2).
 *
 * Unlike MBank's regular statement (Oracle BI Publisher binary `.xls`,
 * handled by mbank.ts via SheetJS), the loan statement is a modern
 * OOXML `.xlsx` — single `Sheet1`, every label/row merged across the
 * full width so each logical row is duplicated on two spreadsheet
 * rows. Layout:
 *
 *   r5    ЗЭЭЛИЙН ДАНСНЫ ХУУЛГА                                (title)
 *   r7-11 Харилцагч / Зээлийн дансны дугаар / Хуулга хамрах
 *         хугацаа / Зээлийн хүү / Зээлийн дүн / Валют /
 *         Эцсийн үлдэгдэл                                       (meta)
 *   r13-14 Огноо | Нийт төлсөн дүн | Нэмэгдүүлсэн хүүгийн
 *          төлөлт | Үндсэн хүүгийн төлөлт | Үндсэн зээлийн
 *          төлөлт | Үлдэгдэл | Гүйлгээний утга                  (header)
 *   r15..  transactions (A = ISO date); each spans two rows
 *   tail   A=Нийт  (column totals)                              (footer)
 *
 * Statement columns are recorded faithfully; mapping loan flows to
 * personal-finance categories is a downstream concern. Pure module:
 * no DB access.
 */

import ExcelJS from "exceljs";
import type { BankParser, ParseResult, ParsedTransaction } from "./types";

const TITLE = "ЗЭЭЛИЙН ДАНСНЫ ХУУЛГА";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Column letters (merged header spans D:E and H:I — take the first).
const C_DATE = "A";
const C_TOTAL = "B"; // Нийт төлсөн дүн
const C_PENALTY = "C"; // Нэмэгдүүлсэн хүүгийн төлөлт
const C_INTEREST = "D"; // Үндсэн хүүгийн төлөлт
const C_PRINCIPAL = "F"; // Үндсэн зээлийн төлөлт
const C_BALANCE = "G"; // Үлдэгдэл
const C_DESC = "H"; // Гүйлгээний утга

function looksLikeXlsx(file: Buffer, filename: string): boolean {
  const zipSig =
    file.length > 4 &&
    file[0] === 0x50 &&
    file[1] === 0x4b &&
    (file[2] === 0x03 || file[2] === 0x05 || file[2] === 0x07);
  return zipSig || filename.toLowerCase().endsWith(".xlsx");
}

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

function cellNumber(v: ExcelJS.CellValue | undefined): number | null {
  const s = cellText(v).replace(/[,\s ]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** First number embedded in a "label:  1,234.56" string. */
function numberInLabel(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

async function loadSheet(file: Buffer): Promise<ExcelJS.Worksheet | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  return wb.worksheets[0] ?? null;
}

export const mbankLoanParser: BankParser = {
  bank: "mbank",
  supportedFormats: ["xlsx"],

  async detect(file: Buffer, filename: string): Promise<boolean> {
    if (!looksLikeXlsx(file, filename)) return false;
    try {
      const ws = await loadSheet(file);
      if (!ws) return false;
      let hasTitle = false;
      let hasMbank = false;
      ws.eachRow({ includeEmpty: false }, (row) => {
        for (let c = 1; c <= 9; c++) {
          const s = cellText(row.getCell(c).value);
          if (!s) continue;
          if (s.includes(TITLE)) hasTitle = true;
          if (s.includes("М банк") || s.includes("М туслах")) {
            hasMbank = true;
          }
        }
      });
      return hasTitle && hasMbank;
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

    // Snapshot rows A..I by row number.
    type Cells = Record<string, string>;
    const rows = new Map<number, Cells>();
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const c: Cells = {};
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        c[col] = cellText(row.getCell(col).value);
      }
      rows.set(n, c);
    });
    const ordered = [...rows.keys()].sort((a, b) => a - b);

    // --- Metadata (labels live in the merged head band, rows 1..14) ---
    const metaTexts = new Set<string>();
    for (const n of ordered) {
      if (n > 14) break;
      const c = rows.get(n)!;
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
        if (c[col]) metaTexts.add(c[col]);
      }
    }
    const meta = (label: string): string | null => {
      for (const s of metaTexts) {
        if (s.startsWith(label)) {
          const i = s.indexOf(":");
          return (i >= 0 ? s.slice(i + 1) : s).trim();
        }
      }
      return null;
    };

    const acct = meta("Зээлийн дансны дугаар");
    if (acct) {
      const digits = acct.replace(/\D/g, "");
      if (digits.length >= 4) result.accountLast4 = digits.slice(-4);
    }
    if (!result.accountLast4) {
      result.warnings.push("Дансны дугаар олдсонгүй — accountLast4 хоосон");
    }
    const metaCurrency = meta("Валют") || "MNT";
    if (metaCurrency !== "MNT") {
      result.warnings.push(`Данс ${metaCurrency} валюттай — хөрвүүлээгүй`);
    }
    const closingMeta = numberInLabel(meta("Эцсийн үлдэгдэл"));

    // --- Transactions: rows whose A is an ISO date, until "Нийт".
    // Each logical row is duplicated by the full-width merge → collapse
    // consecutive rows that are byte-identical across A..H.
    let footerInterest: number | null = null;
    let footerPrincipal: number | null = null;
    let lastBalance: number | null = null;
    let prevKey = "";

    for (const n of ordered) {
      const c = rows.get(n)!;

      if (c.A === "Нийт") {
        footerInterest = cellNumber(c[C_INTEREST]);
        footerPrincipal = cellNumber(c[C_PRINCIPAL]);
        continue;
      }

      const dm = c.A.match(DATE_RE);
      if (!dm) continue; // meta / spacer / header row

      const key = [
        c.A,
        c[C_TOTAL],
        c[C_PENALTY],
        c[C_INTEREST],
        c[C_PRINCIPAL],
        c[C_BALANCE],
        c[C_DESC],
      ].join("␟");
      if (key === prevKey) continue; // merged-row duplicate
      prevKey = key;

      const date = `${dm[1]}-${dm[2]}-${dm[3]}`;
      const total = cellNumber(c[C_TOTAL]);
      const penalty = cellNumber(c[C_PENALTY]);
      const interest = cellNumber(c[C_INTEREST]);
      const principal = cellNumber(c[C_PRINCIPAL]);
      const balance = cellNumber(c[C_BALANCE]);
      const desc = c[C_DESC];

      if (total == null || total === 0) {
        // Disbursement rows also carry the loan amount in `total`; a
        // zero/blank total with a date is an anomaly worth flagging.
        result.errors.push({
          row: n,
          message: `Гүйлгээний дүн алга: "${desc}"`,
        });
        continue;
      }

      // Зээл олголт = disbursement (cash to borrower, debt up) →
      // income; any payment row → expense.
      const isDisbursement = desc.includes("олголт");
      const type: ParsedTransaction["type"] = isDisbursement
        ? "income"
        : "expense";

      if (balance != null) lastBalance = balance;

      result.transactions.push({
        date,
        description: desc,
        amount: Math.abs(total),
        type,
        balanceAfter: balance ?? undefined,
        raw: {
          rowNumber: n,
          template: "loan",
          date,
          total,
          penaltyInterest: penalty,
          interestPaid: interest,
          principalPaid: principal,
          balance,
          description: desc,
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

    // Cross-checks (warnings only).
    const sumInterest = txns.reduce(
      (s, t) => s + (Number(t.raw.interestPaid) || 0),
      0,
    );
    const sumPrincipal = txns.reduce(
      (s, t) => s + (Number(t.raw.principalPaid) || 0),
      0,
    );
    if (
      footerInterest != null &&
      !approxEqual(footerInterest, sumInterest)
    ) {
      result.warnings.push(
        `Хүүгийн нийт зөрүүтэй: тооцсон ${sumInterest}, хуулганд ${footerInterest}`,
      );
    }
    if (
      footerPrincipal != null &&
      !approxEqual(footerPrincipal, sumPrincipal)
    ) {
      result.warnings.push(
        `Үндсэн зээлийн нийт зөрүүтэй: тооцсон ${sumPrincipal}, хуулганд ${footerPrincipal}`,
      );
    }
    if (
      closingMeta != null &&
      lastBalance != null &&
      !approxEqual(closingMeta, lastBalance)
    ) {
      result.warnings.push(
        `Эцсийн үлдэгдэл зөрүүтэй: сүүлийн мөр ${lastBalance}, хуулганд ${closingMeta}`,
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
