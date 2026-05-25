import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';

type LifecycleStatus = FundStateReadV1['calculationState']['status'];

export interface EvidenceHeaderLifecycle {
  status: LifecycleStatus;
  configVersion: number | null;
  runId: number | null;
  lastCalculatedAt: string | null;
  publishedVersion?: number | null;
  source?: string | null;
}

interface EvidenceHeaderProps {
  lifecycle: EvidenceHeaderLifecycle;
  className?: string | undefined;
  testId?: string | undefined;
}

type EvidenceState = 'READY' | 'CALCULATING' | 'FAILED' | 'STALE' | 'UNAVAILABLE';

const DEFAULT_SOURCE = '/api/funds/:id/results';

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

function formatEvidenceTimestamp(value: string | null, state: EvidenceState) {
  if (!value) {
    return state === 'CALCULATING' ? 'CALCULATED PENDING' : 'CALCULATED UNAVAILABLE';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'CALCULATED UNAVAILABLE';

  return `CALCULATED ${new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)}`;
}

function formatRun(runId: number | null, state: EvidenceState) {
  if (runId == null) return 'RUN UNAVAILABLE';
  return state === 'CALCULATING' ? `RUN IN PROGRESS #${runId}` : `RUN #${runId}`;
}

function formatSource(source: string | null | undefined) {
  const trimmed = source?.trim();
  return `SOURCE ${trimmed ? trimmed : DEFAULT_SOURCE}`;
}

function evidenceSegments(lifecycle: EvidenceHeaderLifecycle, state: EvidenceState) {
  const freshness = state === 'READY' ? 'CURRENT' : state === 'CALCULATING' ? 'IN PROGRESS' : state;

  return [
    lifecycle.configVersion != null ? `CONFIG v${lifecycle.configVersion}` : 'CONFIG UNAVAILABLE',
    formatRun(lifecycle.runId, state),
    formatEvidenceTimestamp(lifecycle.lastCalculatedAt, state),
    formatSource(lifecycle.source),
    freshness,
  ];
}

export function EvidenceHeader({ lifecycle, className, testId }: EvidenceHeaderProps) {
  const state = deriveEvidenceState(lifecycle);
  const segments = evidenceSegments(lifecycle, state);

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
      <Badge variant="outline" className={cn('font-poppins uppercase', statusClasses(state))}>
        {state}
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
