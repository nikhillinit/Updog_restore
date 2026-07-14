/**
 * Summary cross-surface readiness rollup (Plan 9 Wave 9B2, D-H).
 *
 * Presentational dense-table renderer for ReadinessRollupModel: five surface
 * rows, each with an underlined workspace link, a dedicated "Decision state"
 * column (D-A placement), the primary blocker inline in muted text, a
 * tabular-nums as-of date, and full warnings behind a row-level disclosure
 * (Enter/Space + aria-expanded, D-D). A neutral blocked-count line renders
 * above the rows when any surface is not actionable. Loading rows render as
 * skeleton placeholders (tabular-nums, motion-reduce gated) — the rollup
 * itself never blanks.
 *
 * @module client/pages/fund-model-results/FundReadinessRollup
 */

import { Fragment, useState } from 'react';
import { Link } from 'wouter';
import { DecisionStateBadge } from '@/components/fund-results';
import type { ReadinessRollupModel, ReadinessRollupRow, ReadinessRowKey } from './readiness-rollup';

function SkeletonValue({ widthClass }: { widthClass: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 ${widthClass} animate-pulse rounded bg-beige-200 tabular-nums motion-reduce:animate-none`}
    />
  );
}

interface RollupRowProps {
  row: ReadinessRollupRow;
  expanded: boolean;
  onToggle: () => void;
}

function RollupRow({ row, expanded, onToggle }: RollupRowProps) {
  const detailsId = `readiness-row-${row.key}-details`;

  return (
    <Fragment>
      <tr data-testid={`readiness-row-${row.key}`} className="border-b border-beige-100 align-top">
        {/* Fix round F6: the surface name is the row header. */}
        <th scope="row" className="py-2 pr-4 text-left font-normal">
          {row.href !== null ? (
            <Link
              href={row.href}
              data-testid={`readiness-link-${row.key}`}
              className="font-medium text-pov-charcoal underline decoration-1 underline-offset-4 hover:text-pov-charcoal"
            >
              {row.label}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              data-testid={`readiness-link-${row.key}-disabled`}
              className="text-presson-textMuted"
            >
              {row.label}
              {row.hrefDisabledReason !== null ? (
                <span className="ml-1 text-xs">({row.hrefDisabledReason})</span>
              ) : null}
            </span>
          )}
        </th>
        {row.loading ? (
          <>
            <td className="py-2 pr-4">
              <span className="sr-only">Resolving readiness</span>
              <SkeletonValue widthClass="w-20" />
            </td>
            <td className="py-2 pr-4">
              <SkeletonValue widthClass="w-32" />
            </td>
            <td className="py-2 pr-4">
              <SkeletonValue widthClass="w-16" />
            </td>
            <td className="py-2" />
          </>
        ) : (
          <>
            <td className="py-2 pr-4">
              <DecisionStateBadge
                state={row.state}
                {...(row.stateLabel !== null ? { label: row.stateLabel } : {})}
                testIdPrefix={`readiness-${row.key}`}
              />
            </td>
            <td className="py-2 pr-4">
              {row.primaryReason !== null ? (
                <p
                  className="text-xs text-presson-textMuted"
                  data-testid={`readiness-row-${row.key}-reason`}
                >
                  {row.primaryReason}
                </p>
              ) : (
                <p aria-hidden="true" className="text-xs text-presson-textMuted">
                  —
                </p>
              )}
              {row.blockedSummary !== null ? (
                <p
                  className="mt-0.5 text-xs tabular-nums text-presson-textMuted"
                  data-testid={`readiness-row-${row.key}-blocked-summary`}
                >
                  {row.blockedSummary}
                </p>
              ) : null}
            </td>
            <td className="py-2 pr-4 text-xs tabular-nums text-presson-textMuted">
              {row.asOfDate ?? '—'}
            </td>
            <td className="py-2 text-right">
              {row.details.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  // Fix round F6: per-surface accessible name so the five
                  // disclosures are distinguishable to assistive tech.
                  aria-label={`Warnings for ${row.label} (${row.details.length})`}
                  {...(expanded ? { 'aria-controls': detailsId } : {})}
                  data-testid={`readiness-row-${row.key}-disclosure`}
                  onClick={onToggle}
                  className="text-xs font-medium text-pov-charcoal underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2"
                >
                  Warnings (<span className="tabular-nums">{row.details.length}</span>)
                </button>
              ) : null}
            </td>
          </>
        )}
      </tr>
      {expanded && row.details.length > 0 ? (
        <tr id={detailsId} data-testid={detailsId}>
          <td colSpan={5} className="bg-beige-50 px-2 py-2">
            <ul className="list-disc space-y-1 pl-5 text-xs text-presson-textMuted">
              {row.details.map((detail, index) => (
                <li key={`${index}-${detail}`}>{detail}</li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function FundReadinessRollup({ model }: { model: ReadinessRollupModel }) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<ReadinessRowKey>>(new Set());

  const toggleRow = (key: ReadinessRowKey) => {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <section
      aria-labelledby="fund-readiness-rollup-heading"
      data-testid="fund-readiness-rollup"
      className="bg-white rounded-lg border border-beige-200 p-6"
    >
      <h2 id="fund-readiness-rollup-heading" className="text-lg font-medium text-charcoal">
        Readiness — what is blocked and where
      </h2>
      {model.blockedCount > 0 ? (
        <p
          className="mt-1 text-xs text-presson-textMuted"
          data-testid="fund-readiness-rollup-blocked-count"
        >
          <span className="tabular-nums">{model.blockedCount}</span> of{' '}
          <span className="tabular-nums">{model.surfaceCount}</span> surfaces not actionable
        </p>
      ) : null}
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-beige-200 text-xs uppercase text-presson-textMuted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Surface
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Decision state
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Primary blocker
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              As of
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Warnings</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <RollupRow
              key={row.key}
              row={row}
              expanded={expandedKeys.has(row.key)}
              onToggle={() => toggleRow(row.key)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
