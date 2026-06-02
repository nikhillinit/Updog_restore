import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ScenarioEvidenceStateV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { ScenarioEvidenceSourceV1 } from './scenario-evidence';

interface ScenarioEvidenceHeaderProps {
  evidence: ScenarioEvidenceSourceV1;
  className?: string;
  testId?: string;
}

function scenarioStatusClasses(state: ScenarioEvidenceStateV1): string {
  switch (state) {
    case 'CURRENT':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'STALE_PUBLISH':
    case 'CALCULATING':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'STALE_CONFIG':
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'UNAVAILABLE':
      return 'border-beige-200 bg-beige-50 text-charcoal-500';
  }
}

function scenarioEvidenceExplanation(state: ScenarioEvidenceStateV1): string {
  switch (state) {
    case 'CURRENT':
      return 'Scenario results were calculated against the current published configuration.';
    case 'STALE_PUBLISH':
      return 'A newer configuration has been published since this scenario was calculated.';
    case 'STALE_CONFIG':
      return 'Scenario overrides reference entities that are no longer valid in the current configuration.';
    case 'CALCULATING':
      return 'Scenario calculation is in progress.';
    case 'FAILED':
      return 'Scenario calculation failed.';
    case 'UNAVAILABLE':
      return 'Scenario evidence is unavailable.';
  }
}

function shortScenarioId(value: string | null): string {
  if (!value) return 'UNAVAILABLE';
  return value.length <= 8 ? value : value.slice(0, 8);
}

function formatVersion(label: string, value: number | null): string {
  return value == null ? `${label} UNAVAILABLE` : `${label} v${value}`;
}

function formatCalculationMode(value: ScenarioEvidenceSourceV1['calculationMode']): string {
  return value == null ? 'MODE UNAVAILABLE' : `MODE ${value}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'CALCULATED UNAVAILABLE';
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

function evidenceSegments(evidence: ScenarioEvidenceSourceV1): string[] {
  return [
    `SCENARIO ${shortScenarioId(evidence.scenarioSetId)}`,
    formatCalculationMode(evidence.calculationMode),
    formatVersion('SOURCE CONFIG', evidence.sourceConfigVersion),
    formatVersion('PUBLISHED CONFIG', evidence.currentPublishedConfigVersion),
    formatTimestamp(evidence.calculatedAt),
    `SOURCE ${evidence.source ?? 'UNAVAILABLE'}`,
  ];
}

export function ScenarioEvidenceHeader({
  evidence,
  className,
  testId,
}: ScenarioEvidenceHeaderProps) {
  const explanation = evidence.reason ?? scenarioEvidenceExplanation(evidence.state);
  const segments = evidenceSegments(evidence);

  return (
    <div
      aria-label={`Scenario evidence: ${explanation}`}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-poppins uppercase text-charcoal-500',
        className
      )}
      data-testid={testId}
    >
      <Badge
        variant="outline"
        className={cn('font-poppins uppercase', scenarioStatusClasses(evidence.state))}
        title={explanation}
        aria-label={explanation}
      >
        {evidence.state}
      </Badge>
      {segments.map((segment) => (
        <span key={segment} className="inline-flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-charcoal-300">
            /
          </span>
          <span className="truncate">{segment}</span>
        </span>
      ))}
      {evidence.reason ? (
        <span className="basis-full normal-case text-charcoal-500">{evidence.reason}</span>
      ) : null}
    </div>
  );
}
