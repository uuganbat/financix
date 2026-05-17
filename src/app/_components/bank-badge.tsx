"use client";

/**
 * Bank logo badge. Shows a brand-coloured monogram by default and
 * auto-swaps in `/public/banks/<slug>.svg` if such a file exists — drop
 * a logo there and it appears, no code change. A module-level cache
 * records slugs with no logo so missing files 404 at most once per
 * session (no flicker on re-render).
 */

import { useState } from "react";

type Brand = { bg: string; short: string };

// bg = a brand-ish tint for the monogram (NOT the trademarked logo);
// short = 1–3 char monogram. Keyed by the `bank` enum slug.
const BRAND: Record<string, Brand> = {
  golomt: { bg: "#1f4fd0", short: "Г" },
  khan: { bg: "#0a8a3c", short: "Х" },
  mbank: { bg: "#6b2fb5", short: "М" },
  tdb: { bg: "#c8102e", short: "ХХБ" },
  kkb: { bg: "#e8772e", short: "К" },
  cash: { bg: "#475569", short: "₮" },
  other: { bg: "#64748b", short: "•" },
};

// Persists across renders/instances for the session.
const missingLogo = new Set<string>();

export function BankBadge({
  bank,
  size = 28,
}: {
  bank: string;
  size?: number;
}) {
  const brand = BRAND[bank] ?? BRAND.other;
  const [missing, setMissing] = useState(() => missingLogo.has(bank));

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: brand.bg,
        fontSize: Math.round(size * (brand.short.length > 1 ? 0.32 : 0.42)),
      }}
    >
      {missing ? (
        brand.short
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/banks/${bank}.svg`}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          onError={() => {
            missingLogo.add(bank);
            setMissing(true);
          }}
        />
      )}
    </span>
  );
}
