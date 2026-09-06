export const RESERVE_WORKER_UNAVAILABLE =
  'Legacy reserve-calc worker retired: fund publication uses the supported inline calculation path.';

export async function startReserveWorker(): Promise<never> {
  throw new Error(RESERVE_WORKER_UNAVAILABLE);
}
