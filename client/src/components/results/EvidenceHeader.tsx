import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';

type LifecycleStatus = FundStateReadV1['calculationState']['status'];

/**
 * Provenance level describes where a section's evidence actually comes from so
 * the header can make truthful claims instead of implying every section is a
 * lifecycle-backed calculation run. When omitted, the header renders the
 * original lifecycle-backed layout (config, run, calculated, source, freshness).
 */
export type EvidenceProvenanceLevel =
  | 'lifecycle_backed_result'
  | 'section_backed_result'
  | 'config_backed_setup'
  | 'mixed_scorecard_sources'
  | 'scenario_evidence';

export interface EvidenceHeaderLifecycle {
  status: LifecycleStatus;
  configVersion: number | null;
  runId?: number | null;
  lastCalculatedAt: string | null;
  publishedVersion?: number | null;
  source?: string | null;
  provenanceLevel?: EvidenceProvenanceLevel;
  /**
   * Pre-composed multi-source label for mixed-source sections (e.g. the
   * scorecard overview). Only consumed when provenanceLevel is
   * 'mixed_scorecard_sources'.
   */
  sourceLabel?: string | null;
}

interface EvidenceHeaderProps {
  lifecycle: EvidenceHeaderLifecycle;
  className?: string | undefined;
  testId?: string | undefined;
}

type EvidenceState = 'READY' | 'CALCULATING' | 'FAILED' | 'STALE' | 'UNAVAILABLE';

const DEFAULT_SOURCE = '/api/funds/:id/results';
const NEUTRAL_BADGE = 'border-beige-200 bg-beige-50 text-charcoal-500';

function deriveEvidenceState(lifecycle: EvidenceHeaderLifecycle): EvidenceState {
  if (lifecycle.status === 'failed') return 'FAILED';
  if (lifecycle.status === 'submitted' || lifecycle.status === 'calculating') return 'CALCULATING';
  if (lifecycle.status !== 'ready') return 'UNAVAILABLE';

  if (
    lifecycle.configVersion != null &&
    lifecycle.publishedVersion != null &&
    lifecycle.configVersion < lifecycle.publishedVersion
  ) {
    return 'STALE';
  }

  return 'READY';
}

function statusClasses(state: EvidenceState) {
  switch (state) {
    case 'READY':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'CALCULATING':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'STALE':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-beige-200 bg-beige-50 text-charcoal-500';
  }
}

function formatTimestamp(label: string, value: string | null) {
  if (!value) return `${label} UNAVAILABLE`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${label} UNAVAILABLE`;

  return `${label} ${new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)}`;
}

function formatCalculatedTimestamp(value: string | null, state: EvidenceState) {
  if (!value) {
    return state === 'CALCULATING' ? 'CALCULATED PENDING' : 'CALCULATED UNAVAILABLE';
  }
  return formatTimestamp('CALCULATED', value);
}

function formatRun(runId: number | null, state: EvidenceState) {
  if (runId == null) return 'RUN UNAVAILABLE';
  return state === 'CALCULATING' ? `RUN IN PROGRESS #${runId}` : `RUN #${runId}`;
}

function formatSource(source: string | null | undefined) {
  const trimmed = source?.trim();
  return `SOURCE ${trimmed ? trimmed : DEFAULT_SOURCE}`;
}

function formatMixedSources(sourceLabel: string | null | undefined) {
  const trimmed = sourceLabel?.trim();
  return `SOURCES ${trimmed && trimmed.length > 0 ? trimmed : 'funds'}`;
}

function freshnessSegment(state: EvidenceState) {
  return state === 'READY' ? 'CURRENT' : state === 'CALCULATING' ? 'IN PROGRESS' : state;
}

function evidenceSegments(lifecycle: EvidenceHeaderLifecycle, state: EvidenceState) {
  const configSegment =
    lifecycle.configVersion != null ? `CONFIG v${lifecycle.configVersion}` : 'CONFIG UNAVAILABLE';

  switch (lifecycle.provenanceLevel) {
    case 'config_backed_setup':
      // Published configuration setup: no calculation run, no calc freshness.
      return [
        configSegment,
        formatTimestamp('PUBLISHED', lifecycle.lastCalculatedAt),
        formatSource(lifecycle.source),
      ];

    case 'mixed_scorecard_sources':
      // Multiple per-field sources: a single config/run/timestamp would
      // misrepresent provenance, so only the derived source set is shown.
      return [formatMixedSources(lifecycle.sourceLabel)];

    case 'section_backed_result':
      // Section-owned calculation evidence: this section emits no run id.
      return [
        configSegment,
        formatCalculatedTimestamp(lifecycle.lastCalculatedAt, state),
        formatSource(lifecycle.source),
        freshnessSegment(state),
      ];

    default:
      // Lifecycle-backed result (original layout, unchanged).
      return [
        configSegment,
        formatRun(lifecycle.runId ?? null, state),
        formatCalculatedTimestamp(lifecycle.lastCalculatedAt, state),
        formatSource(lifecycle.source),
        freshnessSegment(state),
      ];
  }
}

function badgeFor(lifecycle: EvidenceHeaderLifecycle, state: EvidenceState) {
  switch (lifecycle.provenanceLevel) {
    case 'config_backed_setup':
      return { label: 'CONFIG', classes: NEUTRAL_BADGE };
    case 'mixed_scorecard_sources':
      return { label: 'MIXED', classes: NEUTRAL_BADGE };
    default:
      return { label: state, classes: statusClasses(state) };
  }
}

export function EvidenceHeader({ lifecycle, className, testId }: EvidenceHeaderProps) {
  const state = deriveEvidenceState(lifecycle);
  const segments = evidenceSegments(lifecycle, state);
  const badge = badgeFor(lifecycle, state);

  // Follows docs/design/analytics-visualization-principles.md: provenance stays
  // beside material outputs, and missing lifecycle fields are labeled plainly.
  return (
    <div
      aria-label="Evidence header"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-poppins uppercase text-charcoal-500',
        className
      )}
      data-testid={testId}
    >
      <Badge variant="outline" className={cn('font-poppins uppercase', badge.classes)}>
        {badge.label}
      </Badge>
      {segments.map((segment) => (
        <span key={segment} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="text-charcoal-300">
            ·
          </span>
          <span>{segment}</span>
        </span>
      ))}
    </div>
  );
}
