/**
 * Parser registry (SRS §4.2). The import service hands an uploaded file
 * here; `detectParser` returns the first bank parser that recognizes it.
 *
 * Parsers are added incrementally as real sample statements arrive
 * (golomt → xacbank → khan → mbank → tdb → arig).
 */

import type { BankParser } from "./types";
import { golomtParser } from "./golomt";

export const PARSERS: readonly BankParser[] = [golomtParser];

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
