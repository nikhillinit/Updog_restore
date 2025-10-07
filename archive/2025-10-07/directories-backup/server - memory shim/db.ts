import { log } from "./log";
import { env } from "./env";

export type DbClient = unknown;

export async function tryConnectDb(timeoutMs = 2500): Promise<{
  db: DbClient | null;
  ok: boolean;
  error?: string;
}> {
  if (!env.DATABASE_URL) {
    log.info("[DB] DATABASE_URL empty → skipping connection");
    return { db: null, ok: false, error: "no-url" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const { Client } = await import("pg");
    const client = new Client({ connectionString: env.DATABASE_URL });
    // @ts-ignore
    await client.connect();
    clearTimeout(timer);

    log.info("[DB] connected");
    return { db: client, ok: true };
  } catch (e: any) {
    log.warn("[DB] connect failed (non-blocking)", { message: e?.message });
    return { db: null, ok: false, error: e?.message ?? "connect-failed" };
  }
}
