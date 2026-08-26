import { GoldenMetricFixtureSchema, type GoldenMetricFixture } from './_schema';

import fundAllRealized from '../../../fixtures/golden/lp-metrics/fund_all_realized.json';
import fundFullWriteoff from '../../../fixtures/golden/lp-metrics/fund_full_writeoff.json';
import seedFundNoRecycling from '../../../fixtures/golden/lp-metrics/seed_fund_no_recycling.json';
import seedFundWithFollowOnAndRecycling from '../../../fixtures/golden/lp-metrics/seed_fund_with_follow_on_and_recycling.json';

const fixtures = [
  fundAllRealized,
  fundFullWriteoff,
  seedFundNoRecycling,
  seedFundWithFollowOnAndRecycling,
];

export function loadGoldenMetricFixtures(): GoldenMetricFixture[] {
  return fixtures.map((fixture) => GoldenMetricFixtureSchema.parse(fixture));
}
