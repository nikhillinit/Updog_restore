import { MonteCarloAssumptionsProfileV1Schema } from '@shared/contracts/monte-carlo/assumptions-profile-v1.contract';
import type { MonteCarloAssumptionsProfileV1 } from '@shared/contracts/monte-carlo/assumptions-profile-v1.contract';
import { canonicalSha256 } from '@shared/lib/canonical-hash';

const defaultProfileValues = {
  profileVersion: 'mc-assumptions-v1',
  lowDataVolatility: 0.15,
  lowDataConfidence: 0.3,
  aggregateStageProfile: 'seed',
  upsideCompression: 0.82,
  baselineIrrFallback: '0.12',
  baselineDpiFallback: '0.5',
  baselineTvpiFallback: '1.5',
  distributionSelectionRules: {
    multiples: 'power_law',
    skewedMetrics: 'lognormal_when_skew_gt_1',
    smallSamples: 'triangular_when_n_lt_10',
  },
} as const satisfies MonteCarloAssumptionsProfileV1;

const parsedDefaultProfile = MonteCarloAssumptionsProfileV1Schema.parse(
  defaultProfileValues
) as typeof defaultProfileValues;

Object.freeze(parsedDefaultProfile.distributionSelectionRules);
export const defaultMonteCarloAssumptionsProfile = Object.freeze(parsedDefaultProfile);

export const assumptionsProfileHash = canonicalSha256(defaultMonteCarloAssumptionsProfile);
