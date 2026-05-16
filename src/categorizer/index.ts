import { DEFAULT_RULES, type RuleType } from "./rules";

export type CategorizeInput = {
  description: string;
  amount: number;
  /** Parser-detected direction; a rule may refine it (e.g. → transfer) */
  type: "income" | "expense";
};

export type CategorizeResult = {
  /** Seeded system category name, or null when no rule matched */
  category: string | null;
  /** SRS category_source values */
  source: "rule" | "uncategorized";
  /** Set when a rule reclassifies the transaction (e.g. expense → transfer) */
  resolvedType: RuleType;
  /** Index into DEFAULT_RULES, for debugging which rule fired */
  ruleIndex: number | null;
};

/**
 * Rule-engine stage of the pipeline (SRS §5.1). Shared-cache lookup and
 * the Claude Haiku fallback (opt-in, redacted) plug in after this returns
 * `uncategorized` — see SRS §5.1 and review decision #3.
 */
export function categorize(txn: CategorizeInput): CategorizeResult {
  const haystack = txn.description;

  for (let i = 0; i < DEFAULT_RULES.length; i++) {
    const rule = DEFAULT_RULES[i];
    if (rule.pattern.test(haystack)) {
      return {
        category: rule.category,
        source: "rule",
        resolvedType: rule.type,
        ruleIndex: i,
      };
    }
  }

  return {
    category: null,
    source: "uncategorized",
    resolvedType: txn.type,
    ruleIndex: null,
  };
}
