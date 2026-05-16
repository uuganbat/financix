import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ImportClient } from "./_components/import-client";

export default async function ImportPage() {
  if (!(await getSession())) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-zinc-50 p-6 font-sans dark:bg-black">
      <div className="w-full max-w-2xl">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Нүүр
        </Link>
      </div>
      <ImportClient />
    </div>
  );
}
