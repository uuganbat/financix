import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.client ??
  postgres(process.env.DATABASE_URL, {
    max: process.env.NODE_ENV === "production" ? 10 : 1,
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
