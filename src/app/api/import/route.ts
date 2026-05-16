/**
 * POST /api/import — upload a bank statement, parse → categorize →
 * persist for the signed-in user. REST endpoint (per the project's
 * REST+OpenAPI decision) so the future Flutter client can reuse it.
 *
 * Next.js 16 Route Handler: native Request, `request.formData()` for
 * the multipart upload; authoritative session via getSession().
 */

import { getSession } from "@/lib/session";
import { importStatement } from "@/import/service";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — bank statements are small

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "multipart/form-data хүлээж байна" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "`file` талбарт хуулгын файл оруулна уу" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "Файл хэт том (10MB-аас бага байх ёстой)" },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const summary = await importStatement({
      userId: session.user.id,
      file: buffer,
      filename: file.name,
    });
    return Response.json(summary, { status: summary.ok ? 200 : 422 });
  } catch (e) {
    console.error("[import] failed:", e);
    return Response.json(
      { error: "Импорт амжилтгүй боллоо. Дахин оролдоно уу." },
      { status: 500 },
    );
  }
}
