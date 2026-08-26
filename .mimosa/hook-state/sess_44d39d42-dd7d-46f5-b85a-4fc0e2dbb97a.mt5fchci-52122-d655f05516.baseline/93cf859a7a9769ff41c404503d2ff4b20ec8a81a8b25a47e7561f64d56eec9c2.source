import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  scenarioCalculatedTimestamp,
  scenarioStateClasses,
  scenarioStateExplanation,
  type ScenarioEvidenceSourceV1,
} from './scenario-evidence';

interface ScenarioEvidenceHeaderProps {
  evidence: ScenarioEvidenceSourceV1;
  className?: string;
  testId?: string;
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

function evidenceSegments(evidence: ScenarioEvidenceSourceV1): string[] {
  return [
    `SCENARIO ${shortScenarioId(evidence.scenarioSetId)}`,
    formatCalculationMode(evidence.calculationMode),
    formatVersion('SOURCE CONFIG', evidence.sourceConfigVersion),
    formatVersion('PUBLISHED CONFIG', evidence.currentPublishedConfigVersion),
    scenarioCalculatedTimestamp(evidence.calculatedAt),
    `SOURCE ${evidence.source ?? 'UNAVAILABLE'}`,
  ];
}

export function ScenarioEvidenceHeader({
  evidence,
  className,
  testId,
}: ScenarioEvidenceHeaderProps) {
  const explanation = evidence.reason ?? scenarioStateExplanation(evidence.state);
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
        className={cn('font-poppins uppercase', scenarioStateClasses(evidence.state))}
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
