/**
 * Better Auth browser client. `createAuthClient()` defaults to the
 * current origin, so it talks to /api/auth/* on the same host.
 * Import these into Client Components only.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
