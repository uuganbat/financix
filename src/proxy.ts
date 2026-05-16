/**
 * Proxy (Next.js 16 renamed Middleware → Proxy). This is an
 * **optimistic** gate only: it checks for the presence of the Better
 * Auth session cookie to bounce obvious unauthenticated/authenticated
 * traffic early. The authoritative session check lives in Server
 * Components via getSession() (see app/page.tsx) — per the Next.js 16
 * guidance that proxy must not be a session-management layer.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip auth API, Next internals, and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg).*)",
  ],
};
