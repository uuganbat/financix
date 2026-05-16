/**
 * Better Auth catch-all route handler. Next.js 16 Route Handler:
 * `route.ts`, native Request, one file owns all verbs for the segment.
 * `toNextJsHandler` returns the GET/POST Better Auth needs for the
 * sign-in/up/out, session, and callback endpoints.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
