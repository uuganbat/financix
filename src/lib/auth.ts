/**
 * Better Auth server instance (better-auth 1.6.11).
 *
 * Mapped onto the existing `users` table (uuid PK) per the locked
 * decision — only additive schema changes were made (see schema/auth.ts
 * + the `email_verified` column). `generateId: "uuid"` makes Better
 * Auth emit UUID ids that FK cleanly to users/transactions.
 *
 * The `nextCookies()` plugin MUST stay last in `plugins` — it sets
 * auth cookies from Server Actions / Route Handlers.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { account, session, verification } from "@/db/schema/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // No email provider wired yet — keep signups usable for dogfood.
    requireEmailVerification: false,
  },
  // Better Auth's `image` → our existing `avatar_url` column.
  user: { fields: { image: "avatarUrl" } },
  advanced: { database: { generateId: "uuid" } },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
