/**
 * Overview, waterfall, economics, and shared fact-tile rendering for the fund
 * model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/result-section-cards
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';
import type { EconomicsResultV1 } from '@shared/contracts/economics-v1.contract';
import {
  capitalize,
  formatCompactMoney,
  formatMultiple,
  formatNullablePercent,
  percent,
  percentPoints,
} from './formatters';

function OverviewCard({ payload }: { payload: ScorecardPayload }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <FactTile label="Fund Size" value={`$${(payload.fundSize.value / 1_000_000).toFixed(0)}M`} />
      {payload.vintageYear && (
        <FactTile label="Vintage Year" value={String(payload.vintageYear.value)} />
      )}
      {payload.reserveRatio && (
        <FactTile
          label="Reserve Ratio"
          value={`${(payload.reserveRatio.value * 100).toFixed(1)}%`}
        />
      )}
      {payload.avgConfidence && (
        <FactTile
          label="Avg Confidence"
          value={`${(payload.avgConfidence.value * 100).toFixed(0)}%`}
        />
      )}
      {payload.yearsToFullDeploy && (
        <FactTile label="Years to Full Deploy" value={`${payload.yearsToFullDeploy.value} yrs`} />
      )}
      {payload.lastCalculatedAt && (
        <FactTile
          label="Last Calculated"
          value={new Date(payload.lastCalculatedAt.value).toLocaleDateString()}
        />
      )}
    </div>
  );
}

function WaterfallSetupCard({ payload }: { payload: WaterfallSetupSection }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FactTile label="Structure" value={capitalize(payload.type)} />
        <FactTile label="Tiers" value={String(payload.tierCount)} />
        <FactTile
          label="Recycling"
          value={
            payload.recyclingEnabled == null
              ? 'Not set'
              : payload.recyclingEnabled
                ? 'Enabled'
                : 'Disabled'
          }
        />
        <FactTile
          label="Recycling Type"
          value={payload.recyclingType ? capitalize(payload.recyclingType) : 'Not set'}
        />
      </div>

      <div className="space-y-3">
        {payload.tiers.map((tier, index) => (
          <div key={`${tier.name}-${index}`} className="rounded-md border border-beige-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-charcoal">{tier.name}</p>
                <p className="text-sm text-charcoal-500 font-poppins">
                  GP {tier.gpSplit}% / LP {tier.lpSplit}%
                </p>
              </div>
              {tier.condition && tier.condition !== 'none' && tier.conditionValue != null && (
                <p className="text-sm text-charcoal-500 font-poppins">
                  {tier.condition.toUpperCase()} hurdle {tier.conditionValue}
                </p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <FactTile
                label="Preferred Return"
                value={tier.preferredReturn != null ? percent(tier.preferredReturn) : 'Not set'}
              />
              <FactTile
                label="Catch-up"
                value={tier.catchUp != null ? percent(tier.catchUp) : 'Not set'}
              />
              <FactTile
                label="Recycling Cap"
                value={
                  payload.recyclingCap != null ? percentPoints(payload.recyclingCap) : 'Not set'
                }
              />
              <FactTile
                label="Future Recycling"
                value={
                  payload.allowFutureRecycling == null
                    ? 'Not set'
                    : payload.allowFutureRecycling
                      ? 'Allowed'
                      : 'Not allowed'
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EconomicsResultsCard({ payload }: { payload: EconomicsResultV1 }) {
  const { summary, annual, checks } = payload;

  return (
    <div className="space-y-6" data-testid="economics-results-card">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <FactTile label="Gross IRR" value={formatNullablePercent(summary.grossIrr)} />
        <FactTile label="Net LP IRR" value={formatNullablePercent(summary.lpNetIrr)} />
        <FactTile label="Net GP IRR" value={formatNullablePercent(summary.gpNetIrr)} />
        <FactTile
          label="Total GP Carry"
          value={formatCompactMoney(summary.totalGpCarryDistributed)}
        />
        <FactTile label="Management Fees" value={formatCompactMoney(summary.totalManagementFees)} />
        <FactTile label="DPI" value={formatMultiple(summary.finalDpi)} />
        <FactTile label="TVPI" value={formatMultiple(summary.finalTvpi)} />
        <FactTile label="Clawback Exposure" value={formatCompactMoney(summary.finalClawbackDue)} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="font-medium text-charcoal">Economics Cashflows</h3>
          <Badge variant={checks.passed ? 'secondary' : 'destructive'}>
            {checks.passed ? 'Invariants Passed' : `${checks.errors.length} Invariant Issues`}
          </Badge>
        </div>
        <EconomicsCashflowChart rows={annual} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <h3 className="mb-3 font-medium text-charcoal">DPI / RVPI / TVPI</h3>
        <EconomicsJCurveChart rows={annual} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <h3 className="mb-3 font-medium text-charcoal">Waterfall and Carry</h3>
        <EconomicsCarryTable rows={annual} />
      </div>
    </div>
  );
}

function EconomicsCashflowChart({ rows }: { rows: EconomicsResultV1['annual'] }) {
  const maxAbs = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.lpCapitalCalls,
      row.gpCommitmentCalls,
      row.lpDistributions,
      row.gpInvestmentDistributions,
      row.gpCarryDistributed,
      row.feesPaidToManager,
      row.expensesPaid,
    ])
  );
  const series = [
    { key: 'lpCapitalCalls', label: 'LP Calls', color: 'bg-charcoal-300' },
    { key: 'gpCommitmentCalls', label: 'GP Calls', color: 'bg-charcoal-500' },
    { key: 'lpDistributions', label: 'LP Distributions', color: 'bg-presson-positive' },
    { key: 'gpInvestmentDistributions', label: 'GP Investment', color: 'bg-presson-info' },
    { key: 'gpCarryDistributed', label: 'GP Carry', color: 'bg-success' },
    { key: 'feesPaidToManager', label: 'Fees', color: 'bg-presson-warning' },
    { key: 'expensesPaid', label: 'Expenses', color: 'bg-presson-negative' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {series.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs text-charcoal-500">
            <span className={cn('h-2.5 w-2.5 rounded-sm', item.color)} />
            {item.label}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.year} className="grid grid-cols-[3rem_1fr] items-center gap-3">
            <div className="text-xs font-medium text-charcoal-500">Y{row.year}</div>
            <div className="grid h-14 grid-cols-7 items-end gap-1 rounded-md bg-beige-50 px-2 py-1">
              {series.map((item) => {
                const value = row[item.key];
                const heightPct = Math.max(4, (value / maxAbs) * 100);
                return (
                  <div
                    key={item.key}
                    className={cn('rounded-sm', item.color)}
                    style={{ height: `${heightPct}%` }}
                    title={`${item.label}: ${formatCompactMoney(value)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EconomicsJCurveChart({ rows }: { rows: EconomicsResultV1['annual'] }) {
  const maxMultiple = Math.max(1, ...rows.map((row) => Math.max(row.dpi, row.rvpi, row.tvpi)));
  const metrics = [
    { key: 'dpi', label: 'DPI', color: 'bg-presson-positive' },
    { key: 'rvpi', label: 'RVPI', color: 'bg-presson-info' },
    { key: 'tvpi', label: 'TVPI', color: 'bg-charcoal-500' },
  ] as const;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.year} className="grid grid-cols-[3rem_1fr] gap-3">
          <div className="text-xs font-medium text-charcoal-500">Y{row.year}</div>
          <div className="space-y-1.5">
            {metrics.map((metric) => (
              <div key={metric.key} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <span className="text-xs text-charcoal-400">{metric.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-beige-100">
                  <div
                    className={cn('h-full rounded-full', metric.color)}
                    style={{ width: `${Math.max(1, (row[metric.key] / maxMultiple) * 100)}%` }}
                  />
                </div>
                <span className="text-right text-xs text-charcoal-500">
                  {formatMultiple(row[metric.key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EconomicsCarryTable({ rows }: { rows: EconomicsResultV1['annual'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-beige-200 text-xs text-charcoal-400">
          <tr>
            <th className="py-2 pr-4 font-medium">Year</th>
            <th className="py-2 pr-4 font-medium">LP Dist.</th>
            <th className="py-2 pr-4 font-medium">GP Inv. Dist.</th>
            <th className="py-2 pr-4 font-medium">GP Carry</th>
            <th className="py-2 pr-4 font-medium">Escrowed</th>
            <th className="py-2 pr-4 font-medium">Released</th>
            <th className="py-2 pr-4 font-medium">Clawback</th>
            <th className="py-2 pr-4 font-medium">DPI</th>
            <th className="py-2 pr-4 font-medium">TVPI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-beige-100">
          {rows.map((row) => (
            <tr key={row.year}>
              <td className="py-2 pr-4 font-medium text-charcoal">Y{row.year}</td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.lpDistributions)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpInvestmentDistributions)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryDistributed)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryEscrowed)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryReleasedFromEscrow)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.clawbackPaid)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">{formatMultiple(row.dpi)}</td>
              <td className="py-2 pr-4 text-charcoal-500">{formatMultiple(row.tvpi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-beige-50 rounded-md p-3">
      <p className="text-xs text-charcoal-400 font-poppins">{label}</p>
      <p className="text-lg font-medium text-charcoal">{value}</p>
    </div>
  );
}

export { FactTile, OverviewCard, WaterfallSetupCard, EconomicsResultsCard };
