import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "../_components/auth-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return <AuthForm mode="login" />;
}
