import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/prisma-client/client";

// One PrismaClient per server instance. Cached on globalThis in dev so hot reloads
// don't open a new connection pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaConstructor?: typeof PrismaClient };

function getClient(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaConstructor === PrismaClient) return globalForPrisma.prisma;
  // Generated models can change during development while globalThis survives HMR.
  if (globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {});
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  globalForPrisma.prismaConstructor = PrismaClient;
  return client;
}

/**
 * Created on first use, not at import, so `next build` works on machines without DATABASE_URL
 * and only requests that actually touch the database need it.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, prop) => Reflect.get(getClient(), prop),
});
