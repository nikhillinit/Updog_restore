export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5000),
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "",
  DISABLE_AUTH: process.env.DISABLE_AUTH === "1",
  ENABLE_QUEUES: process.env.ENABLE_QUEUES === "1",
  ENABLE_SESSIONS: process.env.ENABLE_SESSIONS === "1",
  MEMORY_MODE: process.env.MEMORY_MODE === "1",
};

export function isMemoryMode() {
  return env.MEMORY_MODE || env.REDIS_URL.startsWith("memory://");
}
