import React, { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CapitalPlanningMemoV1 } from '@shared/contracts/capital-planning-v1.contract';
import type { FundScenarioCapitalComparisonV1 } from '@shared/contracts/fund-scenario-comparison-v1.contract';
import { capitalPlanMemoSections, formatCapitalPlanMemo } from './capital-plan-memo-presentation';

export interface CapitalPlanResultViewProps {
  memo: CapitalPlanningMemoV1;
  copyAllowed?: boolean;
  preview?: boolean;
}

export function CapitalPlanResultView({
  memo,
  copyAllowed = true,
  preview = false,
}: CapitalPlanResultViewProps) {
  const id = useId();
  const sections = useMemo(() => capitalPlanMemoSections(memo, preview), [memo, preview]);
  const [message, setMessage] = useState('');
  const saved = !preview && memo.readState.calculationReadiness.context === 'saved_input';

  async function copyMemo() {
    if (!saved || !copyAllowed) return;
    try {
      await navigator.clipboard.writeText(formatCapitalPlanMemo(memo));
      setMessage('Capital memo copied.');
    } catch {
      setMessage('Clipboard unavailable. Download the complete saved memo instead.');
    }
  }

  function downloadMemo() {
    if (!saved) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(
        new Blob([JSON.stringify(memo, null, 2)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `capital-memo-${memo.scenarioSetId}-${memo.variantId}.json`;
      link.click();
      setMessage('Complete saved memo download started.');
    } catch {
      setMessage('Download unavailable. The saved result remains available for review.');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 space-y-4 rounded-presson-md border border-presson-borderSubtle bg-presson-surface p-4 text-presson-text"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="break-words font-heading text-lg font-semibold">
            {memo.variantName}
          </h3>
          <p className="text-sm text-presson-textMuted">
            {saved ? 'Saved historical result' : 'UNSAVED PREVIEW'}
          </p>
          <p className="break-words text-sm">Source freshness: {memo.readState.sourceFreshness}</p>
        </div>
        {saved && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void copyMemo()}
              disabled={!copyAllowed}
              aria-label={`Copy capital memo: ${memo.variantName}`}
            >
              Copy capital memo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-auto whitespace-normal"
              onClick={downloadMemo}
              aria-label={`Download complete saved memo: ${memo.variantName}`}
            >
              Download complete saved memo
            </Button>
          </div>
        )}
      </header>
      {!saved && (
        <p className="text-sm">
          Review only. Save and calculate before copying or downloading a saved memo.
        </p>
      )}
      {saved && !copyAllowed && (
        <p className="text-sm">Copy is unavailable while this result is being refreshed.</p>
      )}
      {saved && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
      {sections.map((section, sectionIndex) => (
        <details
          key={section.title}
          open={
            sectionIndex < 5 ||
            section.title === 'Aggregate preference forecast' ||
            section.title === 'Disclosures'
          }
          className="min-w-0 border-t border-presson-borderSubtle pt-3"
        >
          <summary className="cursor-pointer rounded-presson-xs font-heading font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent">
            {section.title}
          </summary>
          <dl className="mt-3 space-y-2 text-sm">
            {section.rows.map(({ label, value }, index) => (
              <div key={`${label}-${index}`} className="grid min-w-0 gap-1 sm:grid-cols-2 sm:gap-4">
                <dt className="min-w-0 break-words text-presson-textMuted">{label}</dt>
                <dd className="min-w-0 break-words font-mono tabular-nums [overflow-wrap:anywhere]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}

function comparedValue(value: string | number | boolean | null): string {
  return value === null ? 'Unavailable: not provided' : String(value);
}

export function CapitalPlanComparisonTable({
  comparison,
}: {
  comparison: FundScenarioCapitalComparisonV1;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4 text-presson-text">
      <h2 id={`${id}-title`} className="font-heading text-xl font-semibold">
        Capital plan comparison
      </h2>
      <p className="break-words text-sm">
        Source freshness: {comparison.readState.sourceFreshness}. Saved calculation:{' '}
        {comparison.calculatedAt ?? 'Unavailable: not calculated'}.
      </p>
      {comparison.comparisonStatus === 'no_scenario_results' || !comparison.baseline ? (
        <p role="status">
          Capital results unavailable: calculate this saved scenario set to compare variants.
        </p>
      ) : (
        <>
          <CapitalPlanResultView memo={comparison.baseline} />
          {comparison.variants.map((variant) => (
            <div key={variant.variantId} className="min-w-0 space-y-4">
              <CapitalPlanResultView memo={variant.memo} />
              <p className="text-sm">
                Companion comparison: {variant.companionComparison}. Simultaneous input changes do
                not assign additive causes to output differences.
              </p>
              <div
                role="region"
                aria-label={`Changed inputs: ${variant.name}`}
                tabIndex={0}
                className="max-w-full overflow-x-auto rounded-presson-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent"
              >
                <table className="w-full text-left text-sm">
                  <caption className="pb-2 text-left font-heading font-semibold">
                    Changed inputs: {variant.name}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Input</th>
                      <th scope="col">Baseline</th>
                      <th scope="col">Variant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variant.changedInputs.map((change) => (
                      <tr
                        key={`${change.group}-${change.path}`}
                        className="border-t border-presson-borderSubtle"
                      >
                        <th scope="row" className="p-2 font-normal">
                          {change.label}
                          <span className="block break-all text-xs text-presson-textMuted">
                            {change.group}: {change.path}
                          </span>
                        </th>
                        <td className="break-all p-2 font-mono tabular-nums">
                          {comparedValue(change.baseline)}
                        </td>
                        <td className="break-all p-2 font-mono tabular-nums">
                          {comparedValue(change.variant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {variant.changedInputs.length === 0 && (
                  <p className="py-2 text-sm">No changed inputs.</p>
                )}
              </div>
              <div
                role="region"
                aria-label={`Metric deltas: ${variant.name}`}
                tabIndex={0}
                className="max-w-full overflow-x-auto rounded-presson-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent"
              >
                <table className="w-full text-left text-sm">
                  <caption className="pb-2 text-left font-heading font-semibold">
                    Metric deltas: {variant.name}. Exact server values; percentage deltas are
                    percentages.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric / count basis</th>
                      <th scope="col">Baseline</th>
                      <th scope="col">Variant</th>
                      <th scope="col">Absolute delta</th>
                      <th scope="col">Percentage delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variant.metricDeltas.map((delta) => (
                      <tr
                        key={`${delta.metric}-${delta.countBasis}`}
                        className="border-t border-presson-borderSubtle"
                      >
                        <th scope="row" className="p-2 font-normal">
                          {delta.label}
                          <span className="block text-xs text-presson-textMuted">
                            {delta.group} / {delta.countBasis}
                          </span>
                        </th>
                        {[
                          delta.baselineValue,
                          delta.variantValue,
                          delta.absoluteDelta,
                          delta.percentageDelta,
                        ].map((value, index) => (
                          <td key={index} className="break-all p-2 font-mono tabular-nums">
                            {value ?? `Unavailable: ${delta.unavailableReason ?? 'not provided'}`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
