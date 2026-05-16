import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignOutButton } from "./_components/sign-out-button";

export default async function Home() {
  // Authoritative auth check (proxy.ts only does an optimistic one).
  const session = await getSession();
  if (!session) redirect("/login");

  const { user } = session;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 p-6 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-black/[.08] bg-white p-10 dark:border-white/[.145] dark:bg-black">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Санхүү
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {user.name ? `${user.name} · ` : ""}
              {user.email}
            </p>
          </div>
          <SignOutButton />
        </div>

        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Нэвтэрсэн байна. Хуулга импортлох, ангилах урсгал одоогоор
          <code className="mx-1 rounded bg-black/[.05] px-1.5 py-0.5 dark:bg-white/[.08]">
            scripts/parse-sample.ts
          </code>
          дээр ажиллаж байгаа — веб дээрх импортын дэлгэц дараагийн алхам.
        </p>
      </main>
    </div>
  );
}
