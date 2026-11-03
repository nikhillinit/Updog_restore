import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchCapitalScenarioList,
  fetchCapitalScenarioResults,
} from '@/lib/fund-scenario-workspace-api';
import type { InvestmentComparison } from '@shared/contracts/dual-forecast/investment-comparison.contract';

export interface InvestmentComparisonRequest {
  asOfDate?: string;
  baselineSnapshotId?: number;
  baselineStartMonth?: string;
}

interface Props {
  fundId: number;
  comparison: InvestmentComparison | undefined;
  request: InvestmentComparisonRequest;
  onRequestChange(request: InvestmentComparisonRequest): void;
}

function formatMoney(value: string | null | undefined): string {
  if (value == null) return 'Unavailable';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Unavailable';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(parsed);
}

function formatCount(value: string | number | null | undefined): string {
  if (value == null) return 'Unavailable';
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function categoryBreakdown(values: {
  initialCapital: string;
  followOnCapital: string;
  secondaryCapital?: string | undefined;
  otherCapital?: string | undefined;
}): string {
  const categories = [
    `Initial ${formatMoney(values.initialCapital)}`,
    `Follow-on ${formatMoney(values.followOnCapital)}`,
  ];
  if (Number(values.secondaryCapital ?? 0) !== 0) {
    categories.push(`Secondary ${formatMoney(values.secondaryCapital)}`);
  }
  if (Number(values.otherCapital ?? 0) !== 0) {
    categories.push(`Other ${formatMoney(values.otherCapital)}`);
  }
  return categories.join(' · ');
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-beige-200 bg-white px-3 py-2">
      <p className="text-xs text-charcoal-600">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-pov-charcoal">{value}</p>
    </div>
  );
}

export function InvestmentComparisonPanel({ fundId, comparison, request, onRequestChange }: Props) {
  const [asOfDate, setAsOfDate] = useState(request.asOfDate ?? comparison?.asOfDate ?? '');
  const [scenarioSetId, setScenarioSetId] = useState('');
  const [baselineStartMonth, setBaselineStartMonth] = useState(request.baselineStartMonth ?? '');
  const [isApplying, setIsApplying] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectionVersion = useRef(0);

  function invalidatePendingSelection() {
    selectionVersion.current += 1;
    setIsApplying(false);
    setSelectionError(null);
  }

  useEffect(() => {
    if (!request.asOfDate && comparison?.asOfDate) setAsOfDate(comparison.asOfDate);
  }, [comparison?.asOfDate, request.asOfDate]);

  const scenarioList = useQuery({
    queryKey: ['capital-scenario-list', fundId, 'capital-plan-v2'],
    queryFn: () => fetchCapitalScenarioList(String(fundId), false, 'capital-plan-v2'),
  });
  const selectedScenario = scenarioList.data?.scenarioSets.find(
    (item) => item.id === scenarioSetId
  );
  const selectedRepresentation =
    selectedScenario &&
    'representation' in selectedScenario &&
    selectedScenario.representation === 'capital-plan-v2'
      ? 'capital-plan-v2'
      : 'capital-plan-v1';
  const canApply =
    asOfDate.length > 0 && (scenarioSetId.length === 0 || baselineStartMonth.length > 0);

  async function applyComparison() {
    setSelectionError(null);
    if (!scenarioSetId) {
      onRequestChange({
        asOfDate,
        ...(request.baselineSnapshotId && request.baselineStartMonth
          ? {
              baselineSnapshotId: request.baselineSnapshotId,
              baselineStartMonth: request.baselineStartMonth,
            }
          : {}),
      });
      return;
    }
    const applyVersion = ++selectionVersion.current;
    setIsApplying(true);
    try {
      const result = await fetchCapitalScenarioResults(
        String(fundId),
        scenarioSetId,
        selectedRepresentation
      );
      if (selectionVersion.current !== applyVersion) return;
      if (!result.savedResult) {
        setSelectionError('Selected plan has no saved calculation.');
        return;
      }
      onRequestChange({
        asOfDate,
        baselineSnapshotId: result.savedResult.snapshotId,
        baselineStartMonth,
      });
    } catch {
      if (selectionVersion.current === applyVersion) {
        setSelectionError('Selected plan could not be loaded.');
      }
    } finally {
      if (selectionVersion.current === applyVersion) setIsApplying(false);
    }
  }

  const periods = useMemo(() => {
    const actual = new Map((comparison?.periods ?? []).map((period) => [period.period, period]));
    const baseline = new Map(
      (comparison?.baseline?.periods ?? []).map((period) => [period.period, period])
    );
    return [...new Set([...actual.keys(), ...baseline.keys()])]
      .sort()
      .map((period) => ({ period, actual: actual.get(period), baseline: baseline.get(period) }));
  }, [comparison]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment plan vs published actuals</CardTitle>
        <CardDescription>
          Cash invested in companies, separated from LP capital calls, NAV, and independent
          holdings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="investment-as-of">Actuals through</Label>
            <Input
              id="investment-as-of"
              type="date"
              value={asOfDate}
              onChange={(event) => {
                invalidatePendingSelection();
                setAsOfDate(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="investment-baseline">Saved investment plan</Label>
            <select
              id="investment-baseline"
              value={scenarioSetId}
              onChange={(event) => {
                invalidatePendingSelection();
                setScenarioSetId(event.target.value);
              }}
              className="flex h-10 w-full rounded-md border border-lightGray bg-white px-3 py-2 text-sm"
            >
              <option value="">
                {request.baselineSnapshotId
                  ? 'Keep current saved baseline'
                  : 'No saved baseline selected'}
              </option>
              {(scenarioList.data?.scenarioSets ?? []).map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="baseline-start-month">Baseline starts</Label>
            <Input
              id="baseline-start-month"
              type="month"
              value={baselineStartMonth}
              onChange={(event) => {
                invalidatePendingSelection();
                setBaselineStartMonth(event.target.value);
              }}
              disabled={scenarioSetId.length === 0}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!canApply || isApplying} onClick={applyComparison}>
            Apply comparison
          </Button>
          {request.baselineSnapshotId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                invalidatePendingSelection();
                setScenarioSetId('');
                setBaselineStartMonth('');
                onRequestChange({ asOfDate });
              }}
            >
              Clear baseline
            </Button>
          ) : null}
          {selectionError ? <p className="text-sm text-charcoal-600">{selectionError}</p> : null}
        </div>

        {comparison?.status === 'unavailable' ? (
          <div role="status" className="rounded-md border border-beige-200 bg-beige-50 px-3 py-2">
            <p className="font-medium text-pov-charcoal">
              Published investment actuals unavailable
            </p>
            <p className="mt-1 text-sm text-charcoal-600">{comparison.reason}</p>
          </div>
        ) : comparison?.actual ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric
                label="Deployed capital"
                value={formatMoney(comparison.actual.deployedCapital)}
              />
              <Metric
                label="Initial investments"
                value={formatMoney(comparison.actual.initialCapital)}
              />
              <Metric
                label="Follow-on investments"
                value={formatMoney(comparison.actual.followOnCapital)}
              />
              <Metric
                label="Transactions"
                value={formatCount(comparison.actual.transactionCount)}
              />
              <Metric
                label="Cash-invested companies"
                value={formatCount(comparison.actual.companyCount)}
              />
              {Number(comparison.actual.secondaryCapital ?? 0) !== 0 ? (
                <Metric
                  label="Secondary investments"
                  value={formatMoney(comparison.actual.secondaryCapital)}
                />
              ) : null}
              {Number(comparison.actual.otherCapital ?? 0) !== 0 ? (
                <Metric
                  label="Other investments"
                  value={formatMoney(comparison.actual.otherCapital)}
                />
              ) : null}
            </div>
            <div className="rounded-md border border-beige-200 bg-beige-50 px-3 py-2 text-xs text-charcoal-700">
              <p>
                Published facts snapshot {comparison.basis?.snapshotId ?? 'unavailable'} · actuals
                through {comparison.asOfDate}
              </p>
              <p>
                Empty periods mean no published records in this snapshot; they do not certify zero
                activity.
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-charcoal-600">
            Investment comparison has not been published for this fund.
          </p>
        )}

        {comparison?.baseline ? (
          <div className="space-y-3">
            <div className="rounded-md border border-beige-200 bg-beige-50 px-3 py-2 text-xs text-charcoal-700">
              <p className="font-medium text-pov-charcoal">{comparison.baseline.scenarioName}</p>
              <p>
                Saved snapshot {comparison.baseline.snapshotId} · config version{' '}
                {comparison.baseline.configVersion} · starts {comparison.baseline.startMonth}
              </p>
              <p>Frozen committed capital: {formatMoney(comparison.baseline.committedCapital)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Planned deployment through cutoff"
                value={formatMoney(comparison.baseline.totals.deployedCapital)}
              />
              <Metric
                label="Planned initial capital"
                value={formatMoney(comparison.baseline.totals.initialCapital)}
              />
              <Metric
                label="Planned follow-on capital"
                value={formatMoney(comparison.baseline.totals.followOnCapital)}
              />
              <Metric
                label="Expected companies"
                value={formatCount(comparison.baseline.totals.companyCount)}
              />
            </div>
          </div>
        ) : comparison?.baselineReason ? (
          <p role="status" className="text-sm text-charcoal-600">
            {comparison.baselineReason}
          </p>
        ) : null}

        {periods.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-beige-200 text-xs text-charcoal-600">
                  <th className="px-2 py-2">Quarter</th>
                  <th className="px-2 py-2">Published investment</th>
                  <th className="px-2 py-2">Category breakdown</th>
                  <th className="px-2 py-2">New / cumulative companies</th>
                  <th className="px-2 py-2">Saved plan</th>
                </tr>
              </thead>
              <tbody>
                {periods.map(({ period, actual, baseline }) => (
                  <tr key={period} className="border-b border-beige-100 align-top">
                    <td className="px-2 py-3 font-medium">{period}</td>
                    <td className="px-2 py-3 tabular-nums">
                      {actual ? (
                        <>
                          <p>{formatMoney(actual.deployedCapital)}</p>
                          <p className="text-xs text-charcoal-600">
                            Cumulative {formatMoney(actual.cumulativeCapital)}
                          </p>
                        </>
                      ) : (
                        'No published records'
                      )}
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {actual ? categoryBreakdown(actual) : 'No published records'}
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {actual
                        ? `${actual.newCompanies} / ${actual.cumulativeCompanies}`
                        : 'No published records'}
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {baseline ? (
                        <>
                          <p>
                            {formatMoney(baseline.deployedCapital)} ·{' '}
                            {formatCount(baseline.newCompanies)} expected new
                          </p>
                          <p className="text-xs text-charcoal-600">
                            Cumulative {formatMoney(baseline.cumulativeCapital)} ·{' '}
                            {formatCount(baseline.cumulativeCompanies)} expected companies
                          </p>
                        </>
                      ) : (
                        'No planned records'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {(comparison?.disclosures ?? []).length > 0 ? (
          <ul className="space-y-1 text-xs text-charcoal-600">
            {comparison?.disclosures.map((disclosure) => (
              <li key={disclosure}>{disclosure}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
