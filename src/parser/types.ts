/**
 * Bank statement parser contracts (SRS §4.2).
 *
 * A parser turns a raw uploaded file (PDF/Excel/CSV) into normalized
 * transactions. It must NOT touch the DB — categorization, dedup, and
 * persistence happen downstream in the import service.
 */

export type BankKey =
  | "golomt"
  | "xacbank"
  | "khan"
  | "mbank"
  | "tdb"
  | "arig";

export type ParsedTransaction = {
  /** ISO date "2025-05-08" */
  date: string;
  /** ISO time "14:30:00" if the statement provides it */
  time?: string;
  /** Raw bank description, untouched */
  description: string;
  /** Always positive; sign is carried by `type` */
  amount: number;
  type: "income" | "expense";
  balanceAfter?: number;
  /** Bank's own transaction reference, when present */
  bankRef?: string;
  counterparty?: string;
  /** Original row, kept for debugging / re-parsing */
  raw: Record<string, unknown>;
};

export type ParseResult = {
  success: boolean;
  bank: BankKey;
  /** Last 4 digits only — never store the full account number */
  accountLast4?: string;
  transactions: ParsedTransaction[];
  dateRange: { start: string; end: string } | null;
  summary: {
    totalIncome: number;
    totalExpense: number;
    count: number;
  };
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
};

export interface BankParser {
  bank: BankKey;
  /** e.g. ["pdf", "xlsx", "csv"] */
  supportedFormats: string[];
  /** Cheap heuristic: does this file look like this bank's statement? */
  detect(file: Buffer, filename: string): Promise<boolean>;
  parse(file: Buffer, filename: string): Promise<ParseResult>;
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly bank?: BankKey,
  ) {
    super(message);
    this.name = "ParseError";
  }
}
