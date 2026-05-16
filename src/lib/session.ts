/**
 * Server-side session lookup. Use in Server Components / Route Handlers
 * for the *authoritative* auth check — proxy.ts only does an optimistic
 * cookie check (Next.js 16: proxy is not a session-management layer).
 *
 * `headers()` is async in Next.js 16, hence the await.
 */

import { headers } from "next/headers";
import { auth } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type SessionResult = Awaited<ReturnType<typeof getSession>>;
