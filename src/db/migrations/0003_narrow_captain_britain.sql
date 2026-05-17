ALTER TABLE "transactions" ADD COLUMN "balance_after" numeric(18, 2);
--> statement-breakpoint
-- Backfill running balance from the parser-preserved raw row.
-- Khan exposes it as `balanceAfter`; MBank/TDB as `balance`.
-- Golomt statements have no per-row balance → stays NULL.
UPDATE "transactions"
SET "balance_after" = COALESCE(
  NULLIF("raw_data" ->> 'balanceAfter', '')::numeric,
  NULLIF("raw_data" ->> 'balance', '')::numeric
)
WHERE "balance_after" IS NULL
  AND "raw_data" IS NOT NULL;
--> statement-breakpoint
-- Loan accounts (TDB "Зээлийн дансны хуулга" → raw.template='loan')
-- are credit accounts, not checking.
UPDATE "accounts"
SET "account_type" = 'credit'
WHERE "account_type" <> 'credit'
  AND "id" IN (
    SELECT DISTINCT "account_id" FROM "transactions"
    WHERE "raw_data" ->> 'template' = 'loan'
  );
