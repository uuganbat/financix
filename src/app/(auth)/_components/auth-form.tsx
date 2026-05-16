"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";

type Mode = "login" | "register";

const COPY = {
  login: {
    title: "Нэвтрэх",
    submit: "Нэвтрэх",
    alt: "Бүртгэл байхгүй юу?",
    altLink: "Бүртгүүлэх",
    altHref: "/register",
  },
  register: {
    title: "Бүртгүүлэх",
    submit: "Бүртгүүлэх",
    alt: "Бүртгэлтэй юу?",
    altLink: "Нэвтрэх",
    altHref: "/login",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const res =
      mode === "register"
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password });

    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Алдаа гарлаа. Дахин оролдоно уу.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-black"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        {copy.title}
      </h1>

      {mode === "register" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Нэр</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-11 rounded-lg border border-black/[.12] bg-transparent px-3 outline-none focus:border-black dark:border-white/[.18] dark:focus:border-white"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">И-мэйл</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-11 rounded-lg border border-black/[.12] bg-transparent px-3 outline-none focus:border-black dark:border-white/[.18] dark:focus:border-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Нууц үг</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          className="h-11 rounded-lg border border-black/[.12] bg-transparent px-3 outline-none focus:border-black dark:border-white/[.18] dark:focus:border-white"
        />
      </label>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full bg-foreground font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {pending ? "..." : copy.submit}
      </button>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {copy.alt}{" "}
        <Link
          href={copy.altHref}
          className="font-medium text-zinc-950 underline dark:text-zinc-50"
        >
          {copy.altLink}
        </Link>
      </p>
    </form>
  );
}
