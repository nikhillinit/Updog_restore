/**
 * Comparison surface for economics receipts pinned to internal analysis.
 *
 * Receipt values remain strings through projection and copy. Arithmetic uses
 * Decimal, and the visible evidence block is the exact clipboard payload.
 */
import { useState } from 'react';

import Decimal from '@shared/lib/decimal-config';
import type { InternalLpEconomicsRunReceiptV1 } from '@shared/contracts/internal-economics/lp-economics-run-receipt-v1.contract';
import { Button } from '@/components/ui/button';
import {
  formatDecimalCurrency,
  formatDecimalRatio,
  formatIrr,
} from '@/lib/format/lp-reporting/decimal';

export const INTERNAL_ECONOMICS_NOTICE =
  'Internal decision support and communication preparation only. Not an official financial, accounting, tax, legal, compliance, or LP report.';

export interface InternalEconomicsPanelPin {
  sourceKind: 'draft' | 'reference';
  sourceId: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  knowledgeCutoff: string;
  analysisFactsSnapshotId: number;
  mixedBasisAtSave: boolean;
}

export interface InternalEconomicsPanelGroup {
  runId: number;
  pins: readonly InternalEconomicsPanelPin[];
  primaryPin: InternalEconomicsPanelPin;
}

export interface InternalEconomicsPanelSelection {
  baselineRunId: number | null;
  currentRunId: number | null;
}

export type InternalEconomicsPanelSlot =
  | { runId: number | null; state: 'empty'; receipt: null; error: null }
  | { runId: number; state: 'pending'; receipt: null; error: null }
  | { runId: number; state: 'ready'; receipt: InternalLpEconomicsRunReceiptV1; error: null }
  | { runId: number; state: 'error'; receipt: null; error: Error };

export interface InternalEconomicsPanelProps {
  groups: readonly InternalEconomicsPanelGroup[];
  selection: InternalEconomicsPanelSelection;
  baseline: InternalEconomicsPanelSlot;
  current: InternalEconomicsPanelSlot;
  onSelectionChange: (selection: InternalEconomicsPanelSelection) => void;
}

type EvidenceInput = Omit<InternalEconomicsPanelProps, 'onSelectionChange'>;
type ValueResult = Extract<
  Extract<InternalLpEconomicsRunReceiptV1['outcome'], { runState: 'completed' }>['result'],
  { resultStatus: 'available' | 'indicative' }
>;

interface MetricDefinition {
  key: string;
  label: string;
  value: (result: ValueResult) => string | null;
  format: (value: string | null) => string;
}

const MONEY = (value: string | null) => formatDecimalCurrency(value);
const RATIO = (value: string | null) => formatDecimalRatio(value);

const METRICS: readonly MetricDefinition[] = [
  { key: 'lp-calls', label: 'LP calls', value: (result) => result.totals.lpCapitalCallUsd, format: MONEY },
  { key: 'management-fees', label: 'Management fees', value: (result) => result.totals.managementFeesUsd, format: MONEY },
  { key: 'lp-distributions', label: 'LP distributions', value: (result) => result.totals.lpDistributionUsd, format: MONEY },
  { key: 'gp-carry', label: 'GP carry', value: (result) => result.totals.gpCarryDistributedUsd, format: MONEY },
  { key: 'ending-cash', label: 'Ending cash', value: (result) => result.totals.endingCashUsd, format: MONEY },
  { key: 'gross-nav', label: 'Gross NAV', value: (result) => result.totals.grossNavUsd, format: MONEY },
  { key: 'lp-net-nav', label: 'LP net NAV', value: (result) => result.totals.lpNetNavUsd, format: MONEY },
  { key: 'dpi', label: 'DPI', value: (result) => result.totals.dpi, format: RATIO },
  { key: 'rvpi', label: 'RVPI', value: (result) => result.totals.rvpi, format: RATIO },
  { key: 'tvpi', label: 'TVPI', value: (result) => result.totals.tvpi, format: RATIO },
  { key: 'lp-net-irr', label: 'LP net IRR', value: (result) => result.lpNetIrr, format: formatIrr },
] as const;

function valueResult(slot: InternalEconomicsPanelSlot): ValueResult | null {
  if (slot.state !== 'ready' || slot.receipt.outcome.runState !== 'completed') return null;
  const result = slot.receipt.outcome.result;
  return result.resultStatus === 'unavailable' ? null : result;
}

function groupFor(
  groups: readonly InternalEconomicsPanelGroup[],
  runId: number | null
): InternalEconomicsPanelGroup | null {
  return groups.find((group) => group.runId === runId) ?? null;
}

function coherenceWarnings(
  group: InternalEconomicsPanelGroup | null,
  slot: InternalEconomicsPanelSlot
): string[] {
  if (group === null || slot.state !== 'ready') return [];
  const warnings: string[] = [];
  if (slot.receipt.basis.factsSnapshotId !== group.primaryPin.analysisFactsSnapshotId) {
    warnings.push('Economics pin basis mismatch');
  }
  if (group.primaryPin.sourceKind === 'reference' && group.primaryPin.mixedBasisAtSave) {
    warnings.push('Bundle mixed at save');
  }
  return warnings;
}

function isCoherent(
  group: InternalEconomicsPanelGroup | null,
  slot: InternalEconomicsPanelSlot
): boolean {
  return slot.state === 'ready' && coherenceWarnings(group, slot).length === 0;
}

function decimalDelta(baseline: string | null, current: string | null): string | null {
  if (baseline === null || current === null) return null;
  return new Decimal(current).minus(new Decimal(baseline)).toFixed();
}

function sourceLabel(pin: InternalEconomicsPanelPin): string {
  return pin.sourceKind === 'draft' ? `Open draft #${pin.sourceId}` : `Reference #${pin.sourceId}`;
}

function groupLabel(group: InternalEconomicsPanelGroup): string {
  const pin = group.primaryPin;
  const lineage = group.pins.length === 1 ? '' : ` + ${group.pins.length - 1} linked pin${group.pins.length === 2 ? '' : 's'}`;
  return `${pin.periodStart} to ${pin.periodEnd} - ${sourceLabel(pin)}${lineage}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function reasonLines(slot: InternalEconomicsPanelSlot): string[] {
  if (slot.state === 'error') return [`Read error: ${slot.error.message}`];
  if (slot.state !== 'ready') return [];
  if (slot.receipt.outcome.runState === 'failed') {
    return [`Failure: ${slot.receipt.outcome.failure.code}`];
  }
  return slot.receipt.outcome.result.reasons.map((reason) =>
    reason.detail === undefined ? reason.code : `${reason.code}: ${reason.detail}`
  );
}

function runStatus(slot: InternalEconomicsPanelSlot): string {
  if (slot.state === 'empty') return 'Empty';
  if (slot.state === 'pending') return 'Pending';
  if (slot.state === 'error') return 'Error';
  return titleCase(slot.receipt.outcome.runState);
}

function resultStatus(slot: InternalEconomicsPanelSlot): string {
  if (slot.state !== 'ready' || slot.receipt.outcome.runState === 'failed') return 'Unavailable';
  return titleCase(slot.receipt.outcome.result.resultStatus);
}

function appendSlotEvidence(
  lines: string[],
  label: string,
  group: InternalEconomicsPanelGroup | null,
  slot: InternalEconomicsPanelSlot
): void {
  lines.push(`${label}:`);
  lines.push(`Pin: ${group === null ? 'None' : `${sourceLabel(group.primaryPin)} (${group.primaryPin.periodStart} to ${group.primaryPin.periodEnd})`}`);
  lines.push(`Run ID: ${slot.runId ?? 'None'}`);
  lines.push(`Analysis facts snapshot ID: ${group?.primaryPin.analysisFactsSnapshotId ?? 'None'}`);
  lines.push(`As of: ${group?.primaryPin.knowledgeCutoff ?? 'Unavailable'}`);
  lines.push(`Run status: ${runStatus(slot)}`);
  lines.push(`Result status: ${resultStatus(slot)}`);
  if (slot.state === 'ready') {
    const receipt = slot.receipt;
    lines.push(`Receipt basis cutoff: ${receipt.basis.knowledgeCutoff}`);
    lines.push(`Receipt facts snapshot ID: ${receipt.basis.factsSnapshotId}`);
    lines.push(`Facts input hash (short): ${receipt.hashes.factsSnapshotInputHash.slice(0, 12)}`);
    lines.push('Provenance:');
    lines.push(`  Policy version ID: ${receipt.basis.policyVersionId}`);
    lines.push(`  Capital envelope version ID: ${receipt.basis.capitalEnvelopeVersionId}`);
    lines.push(`  Facts snapshot ID: ${receipt.basis.factsSnapshotId}`);
    lines.push(`  Plan version ID: ${receipt.basis.planVersionId}`);
    lines.push(`  Forecast snapshot ID: ${receipt.basis.forecastSnapshotId}`);
    lines.push(`  Terminal settings: ${receipt.basis.terminalMode} through ${receipt.basis.terminalPeriodEnd} (${receipt.basis.terminalResolutionMethodologyVersion})`);
    lines.push(`  Calculation contract version: ${receipt.versions.calculationContractVersion}`);
    lines.push(`  Engine version: ${receipt.versions.engineVersion}`);
    lines.push(`  Methodology version: ${receipt.versions.methodologyVersion}`);
    lines.push(`  Waterfall template: ${receipt.outcome.runState === 'completed' ? receipt.outcome.result.waterfallTemplate : 'Unavailable'}`);
    for (const [hashLabel, hash] of Object.entries(receipt.hashes)) {
      lines.push(`  ${hashLabel}: ${hash ?? 'Unavailable'}`);
    }
  } else {
    lines.push('Receipt basis cutoff: Unavailable');
  }
  for (const warning of coherenceWarnings(group, slot)) lines.push(`Warning: ${warning}`);
  for (const reason of reasonLines(slot)) lines.push(`Reason: ${reason}`);
}

/** Pure renderer used by both the visible preformatted block and clipboard. */
export function renderInternalEconomicsCopyText(input: EvidenceInput): string {
  const baselineGroup = groupFor(input.groups, input.selection.baselineRunId);
  const currentGroup = groupFor(input.groups, input.selection.currentRunId);
  const baselineResult = valueResult(input.baseline);
  const currentResult = valueResult(input.current);
  const deltasAllowed =
    isCoherent(baselineGroup, input.baseline) && isCoherent(currentGroup, input.current);
  const lines = [INTERNAL_ECONOMICS_NOTICE, ''];

  appendSlotEvidence(lines, 'Baseline', baselineGroup, input.baseline);
  lines.push('');
  appendSlotEvidence(lines, 'Comparison', currentGroup, input.current);
  lines.push('', 'Metrics (raw decimal strings):');
  for (const metric of METRICS) {
    const baseline = baselineResult === null ? null : metric.value(baselineResult);
    const current = currentResult === null ? null : metric.value(currentResult);
    const delta = deltasAllowed ? decimalDelta(baseline, current) : null;
    lines.push(`${metric.label}: baseline=${baseline ?? 'Unavailable'}; comparison=${current ?? 'Unavailable'}; delta=${delta ?? 'Unavailable'}`);
  }
  lines.push('');
  lines.push('Methodology disclosure: forecast uses flat annual fee drag compiled from the same tiered inputs; economics applies the tiered schedule quarterly - methodology difference, not input difference.');
  return lines.join('\n');
}

interface ProvenanceDefinition {
  label: string;
  value: (receipt: InternalLpEconomicsRunReceiptV1) => string;
}

const PROVENANCE: readonly ProvenanceDefinition[] = [
  { label: 'Policy', value: (receipt) => String(receipt.basis.policyVersionId) },
  { label: 'Capital envelope', value: (receipt) => String(receipt.basis.capitalEnvelopeVersionId) },
  { label: 'Facts', value: (receipt) => String(receipt.basis.factsSnapshotId) },
  { label: 'Plan', value: (receipt) => String(receipt.basis.planVersionId) },
  { label: 'Forecast', value: (receipt) => String(receipt.basis.forecastSnapshotId) },
  { label: 'Terminal settings', value: (receipt) => `${receipt.basis.terminalMode} / ${receipt.basis.terminalPeriodEnd} / ${receipt.basis.terminalResolutionMethodologyVersion}` },
  { label: 'Calculation contract', value: (receipt) => receipt.versions.calculationContractVersion },
  { label: 'Engine', value: (receipt) => receipt.versions.engineVersion },
  { label: 'Methodology', value: (receipt) => receipt.versions.methodologyVersion },
  { label: 'Waterfall template', value: (receipt) => receipt.outcome.runState === 'completed' ? receipt.outcome.result.waterfallTemplate : 'Unavailable' },
  { label: 'Capital envelope hash', value: (receipt) => receipt.hashes.capitalEnvelopeHash },
  { label: 'Policy assumptions hash', value: (receipt) => receipt.hashes.policyAssumptionsHash },
  { label: 'Facts snapshot input hash', value: (receipt) => receipt.hashes.factsSnapshotInputHash },
  { label: 'Plan assumptions hash', value: (receipt) => receipt.hashes.planAssumptionsHash },
  { label: 'Forecast input hash', value: (receipt) => receipt.hashes.forecastInputHash },
  { label: 'Input hash', value: (receipt) => receipt.hashes.inputHash },
  { label: 'Result hash', value: (receipt) => receipt.hashes.resultHash ?? 'Unavailable' },
];

function readyReceipt(slot: InternalEconomicsPanelSlot): InternalLpEconomicsRunReceiptV1 | null {
  return slot.state === 'ready' ? slot.receipt : null;
}

function SlotSummary({
  label,
  group,
  slot,
}: {
  label: string;
  group: InternalEconomicsPanelGroup | null;
  slot: InternalEconomicsPanelSlot;
}) {
  const warnings = coherenceWarnings(group, slot);
  const reasons = reasonLines(slot);
  return (
    <div className="space-y-1 rounded-md border border-beige-200 p-3 text-sm">
      <h3 className="font-semibold text-pov-charcoal">{label}</h3>
      <p>Run: <span className="tabular-nums">{slot.runId ?? '--'}</span></p>
      <p>Run status: {runStatus(slot)}</p>
      <p>Result status: {resultStatus(slot)}</p>
      {slot.state === 'ready' ? <p>Receipt basis cutoff: {slot.receipt.basis.knowledgeCutoff}</p> : null}
      {warnings.map((warning) => <p key={warning} role="alert" className="font-medium text-pov-charcoal">{warning}</p>)}
      {reasons.length === 0 ? null : (
        <ul className="list-disc space-y-1 pl-5">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </div>
  );
}

export function InternalEconomicsPanel({
  groups,
  selection,
  baseline,
  current,
  onSelectionChange,
}: InternalEconomicsPanelProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const baselineGroup = groupFor(groups, selection.baselineRunId);
  const currentGroup = groupFor(groups, selection.currentRunId);
  const baselineResult = valueResult(baseline);
  const currentResult = valueResult(current);
  const deltasAllowed = isCoherent(baselineGroup, baseline) && isCoherent(currentGroup, current);
  const evidence = renderInternalEconomicsCopyText({ groups, selection, baseline, current });

  const selectRun = (slot: 'baseline' | 'current', value: string) => {
    const selected = value === '' ? null : Number.parseInt(value, 10);
    if (slot === 'baseline') {
      onSelectionChange(
        selected !== null && selected === selection.currentRunId
          ? { baselineRunId: selection.currentRunId, currentRunId: selection.baselineRunId }
          : { ...selection, baselineRunId: selected }
      );
      return;
    }
    onSelectionChange(
      selected !== null && selected === selection.baselineRunId
        ? { baselineRunId: selection.currentRunId, currentRunId: selection.baselineRunId }
        : { ...selection, currentRunId: selected }
    );
  };

  return (
    <section aria-labelledby="internal-economics-heading" className="space-y-5 rounded-lg border border-beige-200 bg-white p-4">
      <div>
        <h2 id="internal-economics-heading" className="text-lg font-semibold text-pov-charcoal">Internal economics comparison</h2>
        <p className="mt-1 text-sm text-presson-textMuted">{INTERNAL_ECONOMICS_NOTICE}</p>
      </div>

      {groups.length === 0 ? <p className="text-sm text-presson-textMuted">No pinned economics runs are available for comparison.</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-pov-charcoal">
            <span>Baseline</span>
            <select aria-label="Baseline economics run" value={selection.baselineRunId ?? ''} onChange={(event) => selectRun('baseline', event.target.value)} className="w-full rounded-md border border-beige-200 bg-white p-2 font-normal">
              <option value="">No baseline</option>
              {groups.map((group) => <option key={group.runId} value={group.runId}>{groupLabel(group)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-pov-charcoal">
            <span>Comparison</span>
            <select aria-label="Comparison economics run" value={selection.currentRunId ?? ''} onChange={(event) => selectRun('current', event.target.value)} className="w-full rounded-md border border-beige-200 bg-white p-2 font-normal">
              <option value="">No comparison</option>
              {groups.map((group) => <option key={group.runId} value={group.runId}>{groupLabel(group)}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <SlotSummary label="Baseline receipt" group={baselineGroup} slot={baseline} />
        <SlotSummary label="Comparison receipt" group={currentGroup} slot={current} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="mb-2 text-left font-semibold text-pov-charcoal">Economics result metrics</caption>
          <thead><tr className="border-b border-beige-200"><th scope="col" className="p-2">Metric</th><th scope="col" className="p-2">Baseline</th><th scope="col" className="p-2">Comparison</th><th scope="col" className="p-2">Arithmetic delta</th></tr></thead>
          <tbody>
            {METRICS.map((metric) => {
              const baselineValue = baselineResult === null ? null : metric.value(baselineResult);
              const currentValue = currentResult === null ? null : metric.value(currentResult);
              const delta = deltasAllowed ? decimalDelta(baselineValue, currentValue) : null;
              return <tr key={metric.key} className="border-b border-beige-100"><th scope="row" className="p-2 font-medium">{metric.label}</th><td className="p-2 tabular-nums">{metric.format(baselineValue)}</td><td className="p-2 tabular-nums">{metric.format(currentValue)}</td><td className="p-2 tabular-nums">{metric.format(delta)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="mb-2 text-left font-semibold text-pov-charcoal">Receipt provenance comparison</caption>
          <thead><tr className="border-b border-beige-200"><th scope="col" className="p-2">Provenance field</th><th scope="col" className="p-2">Baseline</th><th scope="col" className="p-2">Comparison</th><th scope="col" className="p-2">Comparison</th></tr></thead>
          <tbody>
            {PROVENANCE.map((field) => {
              const baselineReceipt = readyReceipt(baseline);
              const currentReceipt = readyReceipt(current);
              const baselineValue = baselineReceipt === null ? 'Unavailable' : field.value(baselineReceipt);
              const currentValue = currentReceipt === null ? 'Unavailable' : field.value(currentReceipt);
              const comparison = baselineReceipt === null || currentReceipt === null ? 'Unavailable' : baselineValue === currentValue ? 'Same' : 'Changed';
              return <tr key={field.label} className="border-b border-beige-100"><th scope="row" className="p-2 font-medium">{field.label}</th><td className="max-w-xs break-all p-2 font-mono text-xs">{baselineValue}</td><td className="max-w-xs break-all p-2 font-mono text-xs">{currentValue}</td><td className="p-2">{comparison}</td></tr>;
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-presson-textMuted">Forecast uses flat annual fee drag compiled from the same tiered inputs; economics applies the tiered schedule quarterly - methodology difference, not input difference.</p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-pov-charcoal">Copyable evidence</h3>
          <Button type="button" variant="ghost" size="sm" aria-label="Copy the full internal economics evidence block" onClick={() => {
            if (!navigator.clipboard) { setCopyStatus('Copy failed'); return; }
            void navigator.clipboard.writeText(evidence).then(() => setCopyStatus('Evidence copied')).catch(() => setCopyStatus('Copy failed'));
          }}>Copy evidence</Button>
        </div>
        <p aria-live="polite" className="text-xs text-presson-textMuted">{copyStatus}</p>
        <pre data-testid="internal-economics-copy-block" className="whitespace-pre-wrap rounded-md border border-beige-200 bg-white p-3 text-xs text-pov-charcoal">{evidence}</pre>
      </div>
    </section>
  );
}
