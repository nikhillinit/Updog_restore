export const PACING_WORKER_UNAVAILABLE =
  'Legacy pacing-calc worker retired: fund publication uses the supported inline calculation path.';

export async function startPacingWorker(): Promise<never> {
  throw new Error(PACING_WORKER_UNAVAILABLE);
}
