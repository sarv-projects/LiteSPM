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
    try {
      const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

      const adapter = new PrismaLibSql({ url, authToken });
      return new PrismaClient({ adapter, log: ["warn", "error"] });
    } catch (e) {
      console.warn("Failed to initialize Prisma LibSQL adapter, falling back to standard client:", e);
    }
  }

  return new PrismaClient({
    log: ["warn", "error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
