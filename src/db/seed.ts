import { config } from "dotenv";

// Load env before the db module evaluates (it reads DATABASE_URL at import).
config({ path: ".env.local" });

type SeedCategory = {
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  type: "income" | "expense" | "transfer";
  sortOrder: number;
};

/**
 * System default categories (SRS §3.2). Global rows: user_id IS NULL,
 * is_system = true. Also imported by the categorizer/parser to map
 * rule output → category, so keep names stable.
 */
export const SYSTEM_CATEGORIES: SeedCategory[] = [
  // Income
  { name: "Цалин", nameEn: "Salary", icon: "briefcase", color: "#22c55e", type: "income", sortOrder: 1 },
  { name: "Бизнес орлого", nameEn: "Business Income", icon: "building", color: "#16a34a", type: "income", sortOrder: 2 },
  { name: "Хөрөнгө оруулалт", nameEn: "Investment", icon: "trending-up", color: "#15803d", type: "income", sortOrder: 3 },
  { name: "Бусад орлого", nameEn: "Other Income", icon: "plus-circle", color: "#166534", type: "income", sortOrder: 4 },

  // Expense
  { name: "Хоол", nameEn: "Food & Dining", icon: "utensils", color: "#f97316", type: "expense", sortOrder: 10 },
  { name: "Тээвэр", nameEn: "Transportation", icon: "car", color: "#eab308", type: "expense", sortOrder: 11 },
  { name: "Орон сууц", nameEn: "Housing", icon: "home", color: "#3b82f6", type: "expense", sortOrder: 12 },
  { name: "Ус, цахилгаан", nameEn: "Utilities", icon: "zap", color: "#6366f1", type: "expense", sortOrder: 13 },
  { name: "Эрүүл мэнд", nameEn: "Healthcare", icon: "heart", color: "#ec4899", type: "expense", sortOrder: 14 },
  { name: "Боловсрол", nameEn: "Education", icon: "book", color: "#8b5cf6", type: "expense", sortOrder: 15 },
  { name: "Хувцас", nameEn: "Clothing", icon: "shirt", color: "#a855f7", type: "expense", sortOrder: 16 },
  { name: "Зугаа цэнгэл", nameEn: "Entertainment", icon: "film", color: "#f43f5e", type: "expense", sortOrder: 17 },
  { name: "Даатгал", nameEn: "Insurance", icon: "shield", color: "#64748b", type: "expense", sortOrder: 18 },
  { name: "Зээлийн төлбөр", nameEn: "Loan Payment", icon: "credit-card", color: "#ef4444", type: "expense", sortOrder: 19 },
  { name: "Хадгаламж", nameEn: "Savings", icon: "piggy-bank", color: "#14b8a6", type: "expense", sortOrder: 20 },
  { name: "Бэлэг", nameEn: "Gifts", icon: "gift", color: "#d946ef", type: "expense", sortOrder: 21 },
  { name: "Гоо сайхан", nameEn: "Beauty", icon: "sparkles", color: "#fb7185", type: "expense", sortOrder: 22 },
  { name: "Тоног төхөөрөмж", nameEn: "Electronics", icon: "smartphone", color: "#0ea5e9", type: "expense", sortOrder: 23 },
  { name: "Банкны шимтгэл", nameEn: "Bank Fees", icon: "landmark", color: "#94a3b8", type: "expense", sortOrder: 24 },
  { name: "Бусад зарлага", nameEn: "Other Expense", icon: "more-horizontal", color: "#6b7280", type: "expense", sortOrder: 25 },

  // Transfer
  { name: "Шилжүүлэг", nameEn: "Transfer", icon: "arrow-right-left", color: "#0891b2", type: "transfer", sortOrder: 30 },
];

async function main() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { categories } = await import("./schema");

  const result = await db
    .insert(categories)
    .values(
      SYSTEM_CATEGORIES.map((c) => ({
        userId: null,
        name: c.name,
        nameEn: c.nameEn,
        icon: c.icon,
        color: c.color,
        type: c.type,
        sortOrder: c.sortOrder,
        isSystem: true,
      })),
    )
    .onConflictDoUpdate({
      target: [categories.name, categories.type],
      targetWhere: sql`${categories.userId} is null and ${categories.isSystem} = true`,
      set: {
        nameEn: sql`excluded.name_en`,
        icon: sql`excluded.icon`,
        color: sql`excluded.color`,
        sortOrder: sql`excluded.sort_order`,
      },
    })
    .returning({ id: categories.id });

  console.log(`✓ Seeded ${result.length} system categories`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
