import { z } from 'zod';
import { Decimal } from '@shared/lib/decimal-config';
import { transaction } from '../db/pg-circuit.js';
import {
  createHttpError,
  fetchCapitalScenarioSetDetailFromRaw,
  fetchRawScenarioSet,
} from './fund-scenario-set-service.js';
import {
  decodeCapitalSavedSnapshot,
  type CapitalSnapshotRow,
} from './fund-scenario-capital-read-service.js';

export interface ForecastInvestmentBaseline {
  snapshotId: number;
  scenarioName: string;
  configVersion: number;
  inputHash: string;
  startMonth: string;
  committedCapital: string;
  totals: {
    deployedCapital: string;
    initialCapital: string;
    followOnCapital: string;
    companyCount: string;
  };
  periods: Array<{
    period: string;
    initialCapital: string;
    followOnCapital: string;
    deployedCapital: string;
    newCompanies: string;
    cumulativeCapital: string;
    cumulativeCompanies: string;
  }>;
}

const SelectionSchema = z.object({
  fundId: z.number().int().positive(),
  snapshotId: z.number().int().positive(),
  startMonth: z.string().regex(/^(?:19\d{2}|20\d{2}|21\d{2}|2200)-(?:0[1-9]|1[0-2])$/),
  asOfDate: z.string().date(),
});

/** Read a pinned calculation; the caller supplies its calendar anchor explicitly. */
export async function readForecastInvestmentBaseline(
  fundId: number,
  snapshotId: number,
  startMonth: string,
  asOfDate: string
): Promise<ForecastInvestmentBaseline | null> {
  if (!SelectionSchema.safeParse({ fundId, snapshotId, startMonth, asOfDate }).success) {
    throw createHttpError(422, 'Invalid forecast investment baseline selection', {
      code: 'forecast_baseline_selection_invalid',
    });
  }

  return transaction(async (client) => {
    const selected = await client.query<CapitalSnapshotRow>(
      `SELECT id, fund_id, scenario_set_id, config_id, config_version,
              calc_version, state_hash, correlation_id, payload
         FROM fund_snapshots
        WHERE id = $1 AND fund_id = $2 AND type = 'SCENARIOS'`,
      [snapshotId, fundId]
    );
    const row = selected.rows[0];
    if (!row) return null;
    if (row.id !== snapshotId || row.fund_id !== fundId) {
      throw createHttpError(500, 'Stored capital snapshot does not match the selected baseline', {
        code: 'scenario_saved_data_invalid',
      });
    }
    const raw = await fetchRawScenarioSet(client, fundId, row.scenario_set_id);
    const detail = await fetchCapitalScenarioSetDetailFromRaw(client, raw, {
      readCurrentSource: false,
    });
    const saved = decodeCapitalSavedSnapshot(row, detail);
    const baseline = saved.payload.variants.find(
      (variant) => variant.variantId === saved.payload.baselineVariantId
    );
    const schedule = baseline?.result.construction.monthlyDetail.filter(
      (month) => month.countBasis === 'expected'
    );
    // Empty schedules are unavailable, not evidence of a zero-investment plan.
    if (!baseline || !schedule?.length) return null;

    const anchorYear = Number(startMonth.slice(0, 4));
    const anchorMonth = Number(startMonth.slice(5, 7)) - 1;
    const quarters = new Map<string, { initial: Decimal; followOn: Decimal; companies: Decimal }>();
    let initialToDate = new Decimal(0);
    let followOnToDate = new Decimal(0);
    let companiesToDate = new Decimal(0);
    for (const month of schedule) {
      const date = new Date(Date.UTC(anchorYear, anchorMonth + month.demandMonth, 1));
      const year = date.getUTCFullYear();
      const calendarMonth = date.getUTCMonth();
      const period = `${year}-Q${Math.floor(calendarMonth / 3) + 1}`;
      const monthEnd = new Date(Date.UTC(year, calendarMonth + 1, 0)).toISOString().slice(0, 10);
      const quarter = quarters.get(period) ?? {
        initial: new Decimal(0),
        followOn: new Decimal(0),
        companies: new Decimal(0),
      };
      const demand = new Decimal(month.demandUsd);
      if (month.kind === 'initial') {
        quarter.initial = quarter.initial.plus(demand);
        quarter.companies = quarter.companies.plus(month.companyCount);
        if (monthEnd <= asOfDate) {
          initialToDate = initialToDate.plus(demand);
          companiesToDate = companiesToDate.plus(month.companyCount);
        }
      } else {
        quarter.followOn = quarter.followOn.plus(demand);
        if (monthEnd <= asOfDate) followOnToDate = followOnToDate.plus(demand);
      }
      quarters.set(period, quarter);
    }

    let cumulativeCapital = new Decimal(0);
    let cumulativeCompanies = new Decimal(0);
    const periods = [...quarters.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, quarter]) => {
        const deployed = quarter.initial.plus(quarter.followOn);
        cumulativeCapital = cumulativeCapital.plus(deployed);
        cumulativeCompanies = cumulativeCompanies.plus(quarter.companies);
        return {
          period,
          initialCapital: quarter.initial.toFixed(6),
          followOnCapital: quarter.followOn.toFixed(6),
          deployedCapital: deployed.toFixed(6),
          newCompanies: quarter.companies.toFixed(12),
          cumulativeCapital: cumulativeCapital.toFixed(6),
          cumulativeCompanies: cumulativeCompanies.toFixed(12),
        };
      });

    return {
      snapshotId: saved.snapshotId,
      scenarioName: detail.name,
      configVersion: saved.payload.sourceConfigVersion,
      inputHash: saved.payload.inputHash,
      startMonth,
      committedCapital: baseline.result.sourceBundle.fundSize.normalizedValue,
      totals: {
        deployedCapital: initialToDate.plus(followOnToDate).toFixed(6),
        initialCapital: initialToDate.toFixed(6),
        followOnCapital: followOnToDate.toFixed(6),
        companyCount: companiesToDate.toFixed(12),
      },
      periods,
    };
  });
}
