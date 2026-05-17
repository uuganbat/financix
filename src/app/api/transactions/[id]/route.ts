/**
 * PATCH /api/transactions/[id] — manually (re)categorize one
 * transaction. REST endpoint (project's REST+OpenAPI decision) so the
 * future Flutter client reuses it. Setting `categoryId: null` clears
 * the category. Either way `category_source` becomes "manual" and the
 * row is marked reviewed.
 *
 * Next.js 16 Route Handler: `params` is a Promise; authoritative
 * session via getSession().
 */

import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { getSession } from "@/lib/session";

const BodySchema = z.object({
  categoryId: z.uuid().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Гүйлгээний ID буруу" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "JSON хүлээж байна" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "categoryId буруу (uuid эсвэл null байх ёстой)" },
      { status: 400 },
    );
  }
  const { categoryId } = parsed.data;

  // The target category must be visible to this user: a system default
  // (user_id IS NULL) or one they own. Prevents assigning across users.
  let category: { name: string; color: string | null } | null = null;
  if (categoryId) {
    const [found] = await db
      .select({ name: categories.name, color: categories.color })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          isNull(categories.deletedAt),
          or(
            isNull(categories.userId),
            eq(categories.userId, session.user.id),
          ),
        ),
      )
      .limit(1);
    if (!found) {
      return Response.json({ error: "Ангилал олдсонгүй" }, { status: 404 });
    }
    category = found;
  }

  const updated = await db
    .update(transactions)
    .set({
      categoryId,
      categorySource: "manual",
      isReviewed: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, session.user.id),
        isNull(transactions.deletedAt),
      ),
    )
    .returning({ id: transactions.id });

  if (updated.length === 0) {
    return Response.json({ error: "Гүйлгээ олдсонгүй" }, { status: 404 });
  }

  return Response.json({
    id,
    categoryId,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    categorySource: "manual",
  });
}
