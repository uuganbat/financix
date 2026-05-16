import { createHash } from "node:crypto";

/**
 * Stable dedup key for a transaction, matching the `transactions.dedup_hash`
 * unique index `(account_id, dedup_hash)`. Re-importing the same statement
 * (or overlapping date ranges) produces identical hashes, so the insert
 * conflicts instead of duplicating.
 *
 * `bankRef` is included when present (most reliable), but many Mongolian
 * bank exports omit it — the date+amount+description tail keeps the hash
 * stable in that case.
 */
export function computeDedupHash(input: {
  accountId: string;
  date: string; // ISO "2025-05-08"
  amount: number; // always positive
  description: string;
  bankRef?: string;
}): string {
  const normalized = [
    input.accountId,
    input.date,
    input.amount.toFixed(2),
    input.description.trim().replace(/\s+/g, " ").toLowerCase(),
    input.bankRef?.trim() ?? "",
  ].join("|");

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
