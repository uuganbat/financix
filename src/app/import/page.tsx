import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "../_components/app-shell";
import { ImportClient } from "./_components/import-client";

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell current="import" email={session.user.email}>
      <ImportClient />
    </AppShell>
  );
}
