export const COHORT_WORKER_UNAVAILABLE =
  'Legacy cohort-calc worker retired: its output was synthetic and is not calculation evidence.';

export async function startCohortWorker(): Promise<never> {
  throw new Error(COHORT_WORKER_UNAVAILABLE);
}
