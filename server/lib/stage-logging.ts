// server/lib/stage-logging.ts
let recentCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;
const SAMPLE_RATE = Number(process.env.STAGE_LOG_SAMPLE_RATE ?? '0.1');

export function shouldSample(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    recentCount = 0;
    windowStart = now;
  }
  recentCount++;
  if (recentCount < 10) return true; // capture low-volume events
  return Math.random() < SAMPLE_RATE;
}
