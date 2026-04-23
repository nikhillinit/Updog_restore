export const log = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[${new Date().toISOString()}] INFO  ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[${new Date().toISOString()}] WARN  ${msg}`, meta ?? ""),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[${new Date().toISOString()}] ERROR ${msg}`, meta ?? ""),
  banner: (phase: string) =>
    console.log(`\n=== ${phase.toUpperCase()} @ ${new Date().toISOString()} ===`),
};
