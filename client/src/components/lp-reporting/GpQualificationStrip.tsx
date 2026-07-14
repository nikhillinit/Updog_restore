/**
 * GP report-qualification summary strip (Plan 9 Wave 9B1, D-F.3).
 *
 * Compact disclosure rendered ABOVE the LP reporting metrics pipeline on the
 * fund-scoped reports route. It is presentational: the pipeline page publishes
 * a QualificationSnapshot built from the SAME endpoints it already consumes
 * (latest/detail metric run, report package, export blockers) and the strip
 * derives one truthful decision state from it. An unqualified package is
 * never presented as export-ready: 'actionable' requires a locked run, an
 * assembled package, zero disclosed export blockers, AND a proven
 * deterministic export on this surface.
 *
 * @module client/components/lp-reporting/GpQualificationStrip
 */

import { DecisionStateBadge, type DecisionState } from '@/components/fund-results';
import type { LpMetricRunStatus } from '@shared/contracts/lp-reporting';

export interface QualificationStripMetricRun {
  metricRunId: number;
  status: LpMetricRunStatus;
  asOfDate: string;
  evidenceCount: number;
}

export interface QualificationStripPackage {
  status: 'assembled';
  asOfDate: string;
}

export interface QualificationExportBlocker {
  code: string;
  message: string;
}

export interface QualificationSnapshot {
  metricRun: QualificationStripMetricRun | null;
  reportPackage: QualificationStripPackage | null;
  exportBlockers: readonly QualificationExportBlocker[];
  /** True only after this surface produced or verified a deterministic export. */
  exportProven: boolean;
}

export interface QualificationStripModel {
  state: DecisionState;
  label: string;
  reason: string;
  asOfDate: string | null;
  metricRunLabel: string;
  packageLabel: string;
  blockers: readonly QualificationExportBlocker[];
}

function metricRunLabelFor(run: QualificationStripMetricRun): string {
  return `Metric run #${run.metricRunId} — ${run.status}`;
}

export function deriveQualificationStrip(
  snapshot: QualificationSnapshot | null
): QualificationStripModel {
  if (snapshot === null || snapshot.metricRun === null) {
    return {
      state: 'not_actionable',
      label: 'Not export-ready',
      reason: 'No metric run disclosed on this surface yet. Run and qualify metrics below.',
      asOfDate: null,
      metricRunLabel: 'No metric run disclosed',
      packageLabel: 'No report package assembled',
      blockers: [],
    };
  }

  const run = snapshot.metricRun;
  const base = {
    asOfDate: run.asOfDate,
    metricRunLabel: metricRunLabelFor(run),
    packageLabel:
      snapshot.reportPackage === null ? 'No report package assembled' : 'Package assembled',
    blockers: snapshot.exportBlockers,
  };

  if (run.status === 'draft') {
    return {
      ...base,
      state: 'not_actionable',
      label: 'Not export-ready',
      reason:
        run.evidenceCount === 0
          ? 'Draft metric run has no evidence records; approval is blocked.'
          : 'Draft metric run — approve and lock it before packaging.',
    };
  }

  if (run.status === 'approved') {
    return {
      ...base,
      state: 'not_actionable',
      label: 'Not export-ready',
      reason: 'Approved metric run — lock it to enable narratives and packaging.',
    };
  }

  if (run.status === 'superseded') {
    return {
      ...base,
      state: 'not_actionable',
      label: 'Not export-ready',
      reason: 'Metric run superseded — qualify a newer run before exporting.',
    };
  }

  if (snapshot.reportPackage === null) {
    return {
      ...base,
      state: 'not_actionable',
      label: 'Not export-ready',
      reason: 'Locked metric run — approve all narratives and assemble the report package.',
    };
  }

  if (snapshot.exportBlockers.length > 0) {
    const count = snapshot.exportBlockers.length;
    return {
      ...base,
      state: 'not_actionable',
      label: 'Export blocked',
      reason: `${count} export ${count === 1 ? 'blocker' : 'blockers'} disclosed for this package.`,
    };
  }

  if (!snapshot.exportProven) {
    return {
      ...base,
      state: 'indicative',
      label: 'Qualified pending export gates',
      reason: 'Package assembled — export gates are enforced when an export is produced.',
    };
  }

  return {
    ...base,
    state: 'actionable',
    label: 'Export-ready',
    reason: 'A deterministic export was produced for this package with no disclosed blockers.',
  };
}

export function GpQualificationStrip({ snapshot }: { snapshot: QualificationSnapshot | null }) {
  const model = deriveQualificationStrip(snapshot);

  return (
    <section
      aria-label="Report qualification"
      data-testid="gp-qualification-strip"
      className="rounded-lg border border-beige-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-pov-charcoal">Report qualification</h2>
          <DecisionStateBadge
            state={model.state}
            label={model.label}
            details={[model.reason, ...model.blockers.map((blocker) => blocker.message)]}
            testIdPrefix="gp-qualification"
          />
        </div>
        <p className="text-xs text-presson-textMuted">
          As of <span className="tabular-nums">{model.asOfDate ?? '—'}</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-presson-textMuted" data-testid="gp-qualification-reason">
        {model.reason}
      </p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="uppercase text-presson-textMuted">Latest metric run</dt>
          <dd className="mt-0.5 text-pov-charcoal" data-testid="gp-qualification-metric-run">
            {model.metricRunLabel}
          </dd>
        </div>
        <div>
          <dt className="uppercase text-presson-textMuted">Report package</dt>
          <dd className="mt-0.5 text-pov-charcoal" data-testid="gp-qualification-package">
            {model.packageLabel}
          </dd>
        </div>
      </dl>
      {model.blockers.length > 0 ? (
        <ul
          data-testid="gp-qualification-blockers"
          className="mt-2 list-disc space-y-1 pl-5 text-xs text-presson-textMuted"
        >
          {model.blockers.map((blocker, index) => (
            <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
