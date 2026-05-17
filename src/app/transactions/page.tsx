import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  listCategoryOptions,
  listTransactions,
} from "@/transactions/queries";
import { AppShell } from "../_components/app-shell";
import { TransactionsClient } from "./_components/transactions-client";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { page } = await searchParams;
  const pageNum = Number(page) || 1;

  const [data, categories] = await Promise.all([
    listTransactions(session.user.id, pageNum),
    listCategoryOptions(session.user.id),
  ]);

  return (
    <AppShell current="transactions" email={session.user.email}>
      {/* key={data.page} → remount on page nav so optimistic state resets */}
      <TransactionsClient
        key={data.page}
        initial={data}
        categories={categories}
      />
    </AppShell>
  );
}
