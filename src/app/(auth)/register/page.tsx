import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "../_components/auth-form";

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  return <AuthForm mode="register" />;
}
