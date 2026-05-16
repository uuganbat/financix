/**
 * Default categorization rules (SRS §5.2).
 *
 * `category` values MUST exactly match seeded system category names
 * (see src/db/seed.ts SYSTEM_CATEGORIES) — the import service resolves
 * name → category id. Array order = priority (first match wins).
 *
 * Patterns here are static literals over bounded bank descriptions, so
 * they are not a ReDoS surface. User-defined rules (later) will need a
 * safe-regex guard — see SRS review item #15.
 */

export type RuleType = "income" | "expense" | "transfer";

export type CategorizationRule = {
  pattern: RegExp;
  category: string;
  type: RuleType;
};

export const DEFAULT_RULES: CategorizationRule[] = [
  // Salary
  { pattern: /цалин|salary/i, category: "Цалин", type: "income" },
  { pattern: /дараа тооцоо.*цалин/i, category: "Цалин", type: "income" },

  // Food
  {
    pattern: /POS.*Purchase|QPAY|дэлгүүр|номин|emart|минимарт/i,
    category: "Хоол",
    type: "expense",
  },
  {
    pattern: /nomin|good\s*price|cj|freshness/i,
    category: "Хоол",
    type: "expense",
  },

  // Transport
  {
    pattern: /uber|bolt|такси|taxi|шатахуун|нефть|petrovis|magnai/i,
    category: "Тээвэр",
    type: "expense",
  },
  { pattern: /u-money|ubus|автобус/i, category: "Тээвэр", type: "expense" },

  // Housing & Utilities
  { pattern: /түрээс|rent|орон сууц/i, category: "Орон сууц", type: "expense" },
  {
    pattern: /ус.*суваг|цахилгаан|дулаан|интернет|юнивишн|univision|skytel/i,
    category: "Ус, цахилгаан",
    type: "expense",
  },

  // Loan
  {
    pattern: /зээл.*төлбөр|loan|хүү.*төл/i,
    category: "Зээлийн төлбөр",
    type: "expense",
  },

  // Bank fees
  {
    pattern: /шимтгэл|commission|fee/i,
    category: "Банкны шимтгэл",
    type: "expense",
  },

  // Savings
  {
    pattern: /хадгаламж|хуримтлал|savings/i,
    category: "Хадгаламж",
    type: "expense",
  },

  // Transfer
  {
    pattern: /банк хооронд шилжүүлэг|данс.*шилжүүлэг/i,
    category: "Шилжүүлэг",
    type: "transfer",
  },
];
