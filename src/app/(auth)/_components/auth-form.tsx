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

const inputCls =
  "h-11 rounded-lg border border-border bg-background px-3 outline-none transition-colors focus:border-accent";

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
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-8"
    >
      <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>

      {mode === "register" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Нэр</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className={inputCls}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">И-мэйл</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Нууц үг</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          className={inputCls}
        />
      </label>

      {error && <p className="text-sm text-negative">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full bg-accent font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "..." : copy.submit}
      </button>

      <p className="text-center text-sm text-muted">
        {copy.alt}{" "}
        <Link
          href={copy.altHref}
          className="font-medium text-accent hover:underline"
        >
          {copy.altLink}
        </Link>
      </p>
    </form>
  );
}
