/**
 * LP Reporting -- Metric cards grid (Phase 1b.4).
 *
 * Renders the six headline metrics from `LpMetricRunResults` as a
 * responsive grid of shadcn `<Card>`s:
 *   DPI, RVPI, TVPI, MOIC, Net IRR, Gross IRR.
 *
 * Each card receives a decimal-string value (or null) and a formatter.
 * Formatters live in `client/src/lib/format/lp-reporting/decimal.ts`
 * and never call `Number()` / `parseFloat` / `parseInt` on the value.
 * Null inputs render the LP-friendly placeholder `--`.
 *
 * The Net IRR / Gross IRR cards advertise the XIRR diagnostic via an
 * aria-described-by reference to the panel rendered below the grid.
 *
 * @module client/components/lp-reporting/MetricsCards
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDecimalRatio, formatIrr } from '@/lib/format/lp-reporting/decimal';
import type { LpMetricRunResults } from '@shared/contracts/lp-reporting';

export type MetricCardTone = 'neutral' | 'positive' | 'warning';

export interface MetricCardProps {
  label: string;
  value: string | null;
  formatter: (value: string | null) => string;
  tone?: MetricCardTone;
  testId: string;
  /** When set, links the card visually to the XIRR diagnostic block via
   *  `aria-describedby`. Used for Net / Gross IRR cards. */
  describedById?: string;
}

const TONE_CLASS: Record<MetricCardTone, string> = {
  neutral: 'text-charcoal',
  positive: 'text-emerald-700',
  warning: 'text-amber-700',
};

export function MetricCard({
  label,
  value,
  formatter,
  tone = 'neutral',
  testId,
  describedById,
}: MetricCardProps) {
  const display = formatter(value);
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-poppins text-charcoal/70">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold font-inter ${TONE_CLASS[tone]}`}
          data-testid={`${testId}-value`}
          {...(describedById !== undefined && { 'aria-describedby': describedById })}
        >
          {display}
        </div>
        {describedById !== undefined ? (
          <p className="text-xs text-charcoal/60 font-poppins mt-1">via XIRR diagnostic</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export interface MetricsCardsProps {
  results: LpMetricRunResults;
  /** Optional id of the XIRR diagnostic panel for aria-describedby. */
  diagnosticPanelId?: string;
}

export function MetricsCards({ results, diagnosticPanelId }: MetricsCardsProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      data-testid="metrics-cards"
    >
      <MetricCard
        label="DPI"
        value={results.dpi}
        formatter={formatDecimalRatio}
        testId="metric-card-dpi"
      />
      <MetricCard
        label="RVPI"
        value={results.rvpi}
        formatter={formatDecimalRatio}
        testId="metric-card-rvpi"
      />
      <MetricCard
        label="TVPI"
        value={results.tvpi}
        formatter={formatDecimalRatio}
        testId="metric-card-tvpi"
      />
      <MetricCard
        label="MOIC"
        value={results.moic}
        formatter={formatDecimalRatio}
        testId="metric-card-moic"
      />
      <MetricCard
        label="Net IRR"
        value={results.netIrr}
        formatter={formatIrr}
        testId="metric-card-net-irr"
        {...(diagnosticPanelId !== undefined && { describedById: diagnosticPanelId })}
      />
      <MetricCard
        label="Gross IRR"
        value={results.grossIrr}
        formatter={formatIrr}
        testId="metric-card-gross-irr"
        {...(diagnosticPanelId !== undefined && { describedById: diagnosticPanelId })}
      />
    </div>
  );
}

export default MetricsCards;
