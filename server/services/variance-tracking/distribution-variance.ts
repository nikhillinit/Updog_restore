export interface DistributionVarianceRow {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number | null;
  currentCountShare: number;
  baselineCountShare: number;
  countShareDelta: number;
  countShareDeltaPct: number | null;
}

export function analyzeDistributionVariances(
  current: Record<string, number>,
  baseline: Record<string, number>
): Record<string, DistributionVarianceRow> {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
  const baselineTotal = Object.values(baseline).reduce((sum, value) => sum + value, 0);
  const result: Record<string, DistributionVarianceRow> = {};

  for (const key of allKeys) {
    const cur = current[key] ?? 0;
    const base = baseline[key] ?? 0;
    const delta = cur - base;
    const deltaPct = base !== 0 ? delta / base : null;
    const currentCountShare = currentTotal > 0 ? cur / currentTotal : 0;
    const baselineCountShare = baselineTotal > 0 ? base / baselineTotal : 0;
    const countShareDelta = currentCountShare - baselineCountShare;
    const countShareDeltaPct =
      baselineCountShare !== 0 ? countShareDelta / baselineCountShare : null;

    result[key] = {
      current: cur,
      baseline: base,
      delta,
      deltaPct,
      currentCountShare,
      baselineCountShare,
      countShareDelta,
      countShareDeltaPct,
    };
  }

  return result;
}
