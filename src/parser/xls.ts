/**
 * Shared SheetJS reader for legacy binary `.xls` (BIFF8 / OLE2) bank
 * exports — MBank and TDB ship these; Golomt ships modern `.xlsx`
 * (handled by exceljs in golomt.ts).
 *
 * SheetJS is pinned to the patched vendor build (≥0.20.3, installed
 * from cdn.sheetjs.com) — the npm-registry `xlsx@0.18.5` carries open
 * prototype-pollution (CVE-2023-30533) / ReDoS (CVE-2024-22363)
 * advisories and must NOT be used to parse uploaded files.
 */

import * as XLSX from "xlsx";

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];

export function readWorkbook(file: Buffer): {
  sheetNames: string[];
  /** Row-major grid (header:1) for the named sheet, or sheet 0. */
  grid(name?: string): Grid;
} {
  const wb = XLSX.read(file, { type: "buffer", cellDates: true });
  return {
    sheetNames: wb.SheetNames,
    grid(name?: string): Grid {
      const s =
        name && wb.SheetNames.includes(name) ? name : wb.SheetNames[0];
      const ws = wb.Sheets[s];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }) as Grid;
    },
  };
}

/** OLE2 compound-document magic — true binary `.xls`. */
export function looksLikeXls(file: Buffer, filename: string): boolean {
  const ole2 =
    file.length > 8 &&
    file[0] === 0xd0 &&
    file[1] === 0xcf &&
    file[2] === 0x11 &&
    file[3] === 0xe0;
  return ole2 || /\.xls$/i.test(filename);
}

export function text(v: Cell | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Tolerant numeric: strips thousands separators / spaces. */
export function num(v: Cell | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,\s ]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date/time from a SheetJS Date cell using **UTC** fields. SheetJS maps
 * the Excel serial onto a naive wall-clock and tags it Z, so the UTC
 * components are the bank's displayed local time; local getters would
 * shift it by the runtime TZ (and flip the date near midnight).
 */
export function dateUTC(d: Date): { date: string; time: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
  };
}

/** First number embedded in a label like "Эхний үлдэгдэл:  4,053,997.79". */
export function numberInLabel(s: string): number | null {
  const m = s.match(/-?[\d,]+(?:\.\d+)?/g);
  if (!m) return null;
  for (let i = m.length - 1; i >= 0; i--) {
    const n = Number(m[i].replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
