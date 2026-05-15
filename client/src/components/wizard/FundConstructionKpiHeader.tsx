import { useMemo } from 'react';
import { HeaderMetricCard, type HeaderMetricCardView } from '@/components/layout/HeaderMetricCard';
import { fundStore } from '@/stores/fundStore';
import type { CapitalPlanAllocation } from '@/stores/fundStore';
import { useFundTuple } from '@/stores/useFundSelector';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { formatUSDShort } from '@/lib/formatting';
import { runEconomicsModel } from '@shared/lib/economics/economics-engine';

interface DraftEconomicsPreview {
  dpi: number | null;
  tvpi: number | null;
  irr: number | null;
  projectedValue: number | null;
}

function fundSizeToDollars(value: number | undefined): number | null {
  if (value == null || value <= 0) return null;
  return value >= 1_000_000 ? value : value * 1_000_000;
}

function formatCurrency(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? 'N/A' : formatUSDShort(value);
}

function formatMultiple(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? 'N/A' : `${value.toFixed(2)}x`;
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? 'Needs history'
    : `${(value * 100).toFixed(1)}%`;
}

function sumPlannedCapital(fundSizeDollars: number | null, allocations: CapitalPlanAllocation[]) {
  if (fundSizeDollars == null) return null;
  return allocations.reduce(
    (sum, allocation) => sum + fundSizeDollars * (allocation.capitalAllocationPct / 100),
    0
  );
}

function averageInitialCheck(allocations: CapitalPlanAllocation[]) {
  const checks = allocations
    .map((allocation) => allocation.initialCheckAmount)
    .filter((value): value is number => value != null && value > 0);
  if (checks.length === 0) return null;
  return checks.reduce((sum, value) => sum + value, 0) / checks.length;
}

function estimateCompanies(fundSizeDollars: number | null, allocations: CapitalPlanAllocation[]) {
  if (fundSizeDollars == null) return null;
  const total = allocations.reduce((sum, allocation) => {
    if (allocation.initialCheckAmount == null || allocation.initialCheckAmount <= 0) {
      return sum;
    }
    const allocatedCapital = fundSizeDollars * (allocation.capitalAllocationPct / 100);
    return sum + allocatedCapital / allocation.initialCheckAmount;
  }, 0);
  return total > 0 ? Math.floor(total) : null;
}

function previewDraftEconomics(fundSizeDollars: number | null): DraftEconomicsPreview {
  if (fundSizeDollars == null) {
    return { dpi: null, tvpi: null, irr: null, projectedValue: null };
  }

  try {
    const draft = fundStoreToDraftWriteV1(fundStore.getState(), {
      includeEconomicsAssumptions: true,
    });
    const result = runEconomicsModel({ ...draft, fundSize: fundSizeDollars });
    const projectedValue = Math.max(0, ...result.annual.map((row) => row.lpNetNav));

    return {
      dpi: result.summary.finalDpi,
      tvpi: result.summary.finalTvpi,
      irr: result.summary.lpNetIrr,
      projectedValue,
    };
  } catch {
    return { dpi: null, tvpi: null, irr: null, projectedValue: null };
  }
}

function makeCard(
  key: string,
  title: string,
  displayValue: string,
  icon: HeaderMetricCardView['icon'],
  theme: HeaderMetricCardView['theme'],
  titleText: string
): HeaderMetricCardView {
  return { key, title, displayValue, icon, theme, titleText };
}

function hasUsableDisplayValue(card: HeaderMetricCardView) {
  return card.displayValue !== 'N/A' && card.displayValue !== 'Needs history';
}

export function FundConstructionKpiHeader() {
  const [
    fundName,
    fundSize,
    managementFeeRate,
    carriedInterest,
    fundLife,
    investmentPeriod,
    gpCommitment,
    capitalPlanAllocations,
    waterfallType,
    waterfallTiers,
    recyclingEnabled,
    recyclingType,
    recyclingCap,
    recyclingPeriod,
    exitRecyclingRate,
    mgmtFeeRecyclingRate,
    allowFutureRecycling,
    economicsAssumptions,
  ] = useFundTuple((state) => [
    state.fundName,
    state.fundSize,
    state.managementFeeRate,
    state.carriedInterest,
    state.fundLife,
    state.investmentPeriod,
    state.gpCommitment,
    state.capitalPlanAllocations,
    state.waterfallType,
    state.waterfallTiers,
    state.recyclingEnabled,
    state.recyclingType,
    state.recyclingCap,
    state.recyclingPeriod,
    state.exitRecyclingRate,
    state.mgmtFeeRecyclingRate,
    state.allowFutureRecycling,
    state.economicsAssumptions,
  ]);

  const fundSizeDollars = fundSizeToDollars(fundSize);
  const plannedCapital = useMemo(
    () => sumPlannedCapital(fundSizeDollars, capitalPlanAllocations),
    [capitalPlanAllocations, fundSizeDollars]
  );
  const avgCheck = useMemo(
    () => averageInitialCheck(capitalPlanAllocations),
    [capitalPlanAllocations]
  );
  const activeCompanies = useMemo(
    () => estimateCompanies(fundSizeDollars, capitalPlanAllocations),
    [capitalPlanAllocations, fundSizeDollars]
  );
  const previewInputKey = JSON.stringify([
    managementFeeRate,
    carriedInterest,
    fundLife,
    investmentPeriod,
    gpCommitment,
    capitalPlanAllocations,
    waterfallType,
    waterfallTiers,
    recyclingEnabled,
    recyclingType,
    recyclingCap,
    recyclingPeriod,
    exitRecyclingRate,
    mgmtFeeRecyclingRate,
    allowFutureRecycling,
    economicsAssumptions,
  ]);
  const preview = useMemo(() => {
    void previewInputKey;
    return previewDraftEconomics(fundSizeDollars);
  }, [fundSizeDollars, previewInputKey]);

  const remainingCapital =
    fundSizeDollars == null || plannedCapital == null
      ? null
      : Math.max(0, fundSizeDollars - plannedCapital);
  const fundLabel = fundName?.trim() || 'Draft fund construction inputs';

  const cards: HeaderMetricCardView[] = [
    makeCard(
      'totalInvested',
      'Total Invested',
      formatCurrency(plannedCapital),
      'dollar',
      'white',
      `Planned capital from ${fundLabel}`
    ),
    makeCard(
      'currentValue',
      'Current Value',
      formatCurrency(preview.projectedValue),
      'trending-up',
      'beige',
      'Projected value from the current construction draft'
    ),
    makeCard(
      'irr',
      'Net IRR',
      formatPercent(preview.irr),
      'bar-chart',
      'white',
      'Draft net IRR from the current construction inputs'
    ),
    makeCard(
      'tvpi',
      'TVPI',
      formatMultiple(preview.tvpi),
      'target',
      'beige',
      'Draft total value to paid-in from the current construction inputs'
    ),
    makeCard(
      'dpi',
      'DPI',
      formatMultiple(preview.dpi),
      'pie-chart',
      'white',
      'Draft distributions to paid-in from the current construction inputs'
    ),
    makeCard(
      'activeInvestments',
      'Active',
      activeCompanies == null ? 'N/A' : String(activeCompanies),
      'activity',
      'beige',
      'Estimated company count from planned initial checks'
    ),
    makeCard(
      'avgCheckSize',
      'Avg Check',
      formatCurrency(avgCheck),
      'dollar',
      'white',
      'Average initial check from capital allocation rows'
    ),
    makeCard(
      'remainingCapital',
      'Remaining',
      formatCurrency(remainingCapital),
      'calendar',
      'beige',
      'Fund size less currently planned allocation'
    ),
  ];
  const visibleCards = cards.filter(hasUsableDisplayValue);

  if (visibleCards.length === 0) {
    return null;
  }

  return (
    <div
      className="border-b border-slate-200 bg-white px-3 py-3 sm:px-6"
      data-testid="fund-construction-kpis"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {visibleCards.map((card) => (
          <HeaderMetricCard key={card.key} card={card} testId={`construction-kpi-${card.key}`} />
        ))}
      </div>
    </div>
  );
}
