import type { LPReportData } from '../services/pdf-generation/types.js';

/**
 * Resolve the fundId for a report job.
 *
 * Defense-in-depth: asserts every requested fund is one the LP actually holds a
 * commitment for. The sole enqueue path already rejects funds outside the LP's
 * commitment snapshot, so this never fires on legitimate traffic; it guards
 * against a commitment revoked between enqueue and processing, and against any
 * future out-of-band enqueue.
 */
export function resolveFundId(jobFundIds: number[] | undefined, lpData: LPReportData): number {
  const commitmentFundIds = lpData.commitments.map((c) => c.fundId);
  if (jobFundIds) {
    const unauthorized = jobFundIds.find((id) => !commitmentFundIds.includes(id));
    if (unauthorized !== undefined) {
      throw new Error(`Report job requested fund ${unauthorized} outside the LP's commitments`);
    }
  }
  const fundId = jobFundIds?.[0] || commitmentFundIds[0];
  if (!fundId) {
    throw new Error('No fund ID available for report generation');
  }
  return fundId;
}
