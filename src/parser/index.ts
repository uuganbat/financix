/**
 * Parser registry (SRS §4.2). The import service hands an uploaded file
 * here; `detectParser` returns the first bank parser that recognizes it.
 *
 * Parsers are added incrementally as real sample statements arrive
 * (golomt → xacbank → khan → mbank → tdb → arig).
 */

import type { BankParser } from "./types";
import { golomtParser } from "./golomt";
import { khanParser } from "./khan";
import { mbankParser } from "./mbank";
import { mbankLoanParser } from "./mbank-loan";
import { tdbParser } from "./tdb";

export const PARSERS: readonly BankParser[] = [
  // Must precede golomtParser: its detect() matches the loose substring
  // "ДАНСНЫ ХУУЛГА", which the MBank-loan title "ЗЭЭЛИЙН ДАНСНЫ ХУУЛГА"
  // also contains. mbankLoanParser.detect is strict (title + "М банк").
  mbankLoanParser, // .xlsx (loan, single Sheet1)
  golomtParser, // .xlsx (JasperReports)
  khanParser, // .xlsx (Deposit Account Statement)
  mbankParser, // .xls (Oracle BIP)
  tdbParser, // .xls (Crystal Reports)
];

export async function detectParser(
  file: Buffer,
  filename: string,
): Promise<BankParser | null> {
  for (const parser of PARSERS) {
    if (await parser.detect(file, filename)) return parser;
  }
  return null;
}

export type { BankParser } from "./types";
export {
  type ParseResult,
  type ParsedTransaction,
  ParseError,
} from "./types";
