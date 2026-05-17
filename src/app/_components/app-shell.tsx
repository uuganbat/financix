import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 transition-colors ${
        active
          ? "bg-surface-2 font-medium text-foreground"
          : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppShell({
  current,
  email,
  children,
}: {
  current?: "dashboard" | "transactions" | "import";
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Санхүү
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/" active={current === "dashboard"}>
                Хяналт самбар
              </NavLink>
              <NavLink
                href="/transactions"
                active={current === "transactions"}
              >
                Гүйлгээ
              </NavLink>
              <NavLink href="/import" active={current === "import"}>
                Импорт
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden text-sm text-muted sm:inline">
                {email}
              </span>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
