import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL?.trim() || "";
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const url = tursoUrl || (dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://") ? dbUrl : "");

  if (url) {
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
    // Do not silently substitute an unwritable SQLite file for a failed remote adapter.
    const adapter = new PrismaLibSql({ url, authToken });
    return new PrismaClient({ adapter, log: ["warn", "error"] });
  }

  return new PrismaClient({
    log: ["warn", "error"],
  });
}

/**
 * True when a write has a durable place to land.
 *
 * Production must use a remote libSQL/Turso URL: a Vercel/standalone filesystem
 * is read-only, so the Prisma `file:` fallback only works in local development.
 * Routes call this and return a clear 503 instead of pretending a write was
 * recorded.
 */
export function databaseConfigured(): boolean {
  if (process.env.LITESPM_DATABASE_MODE === "fallback") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() || "";
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) return tursoUrl.startsWith("libsql://") || tursoUrl.startsWith("https://");
  if (dbUrl.startsWith("libsql://") || dbUrl.startsWith("https://")) return true;
  if (process.env.NODE_ENV !== "production" && dbUrl.startsWith("file:")) return true;
  return false;
}

export function getDatabase(): PrismaClient {
  if (!databaseConfigured()) throw new Error("Database storage is not configured");
  return (globalForPrisma.prisma ??= createPrismaClient());
}
