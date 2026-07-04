/**
 * Pure reason-copy, provenance, evidence-header, scorecard-source, and
 * lifecycle diagnostic helpers for the fund model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/evidence
 */

import type { EvidenceHeaderLifecycle } from '@/components/results/EvidenceHeader';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import { hasStaleEvidence } from './formatters';
import type { SectionLike } from './types';

export const REASON_COPY: Record<string, string> = {
  NO_PUBLISHED_CONFIG: 'Publish your fund configuration to see this section.',
  CALCULATION_PENDING: 'Results are being calculated. Check back shortly.',
  STALE_EVIDENCE: 'A newer configuration was published. Request recalculation to update.',
  INVALID_PUBLISHED_CONFIG: 'The published configuration has validation issues.',
  NO_AUTHORITATIVE_SOURCE: 'This section is not yet available for your fund.',
  SCENARIOS_NONE_EXIST: 'Create a scenario set to compare alternate fund economics.',
  SCENARIOS_NONE_CALCULATED: 'Calculate a scenario set to show scenario results here.',
  SCENARIOS_LOAD_FAILED: 'Scenario results could not be loaded.',
  ECONOMICS_DISABLED: 'GP economics is currently disabled for this environment.',
  ECONOMICS_NOT_CONFIGURED: 'Publish economics assumptions to see GP economics.',
  ECONOMICS_SNAPSHOT_PENDING: 'Economics is configured and waiting for a calculation snapshot.',
  ECONOMICS_INPUT_INVALID: 'The published economics assumptions have validation issues.',
  ECONOMICS_ENGINE_FAILED: 'The economics engine failed before producing a valid result.',
  ECONOMICS_INVARIANT_FAILED: 'The economics engine found a reconciliation issue.',
  ECONOMICS_STALE_CONFIG_VERSION:
    'Economics results belong to an older published configuration. Recalculate to update.',
};

export function reasonCopyFor(section: { [key: string]: unknown }): string {
  // Bracket notation required: TS4111 with noPropertyAccessFromIndexSignature
  const code = typeof section['reasonCode'] === 'string' ? section['reasonCode'] : undefined;
  const reason = typeof section['reason'] === 'string' ? section['reason'] : undefined;
  if (code && REASON_COPY[code]) {
    return REASON_COPY[code];
  }
  return reason ?? 'Not available';
}

export function getSectionSource(section: SectionLike) {
  const source = section['source'];
  return typeof source === 'string' && source.trim().length > 0 ? source : null;
}

export function sectionNumber(section: SectionLike, key: string): number | null {
  const value = section[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sectionString(section: SectionLike, key: string): string | null {
  const value = section[key];
  return typeof value === 'string' ? value : null;
}

export function sectionEvidence(
  lifecycle: EvidenceHeaderLifecycle | undefined,
  section: SectionLike
): EvidenceHeaderLifecycle | null {
  if (!lifecycle) return null;
  // Pre-resolved section/config/mixed provenance is authoritative -- do not
  // re-derive its source from the section wrapper.
  if (lifecycle.provenanceLevel != null) return lifecycle;
  return {
    ...lifecycle,
    source: getSectionSource(section) ?? lifecycle.source ?? null,
  };
}

export function evidenceFromLifecycle(lifecycle: FundStateReadV1): EvidenceHeaderLifecycle {
  return {
    status: lifecycle.calculationState.status,
    configVersion: lifecycle.calculationState.configVersion,
    runId: lifecycle.calculationState.runId,
    lastCalculatedAt: lifecycle.calculationState.lastCalculatedAt,
    publishedVersion: lifecycle.configState.publishedVersion,
    source: '/api/funds/:id/results',
  };
}

// GP Economics: section-owned calculation evidence. The section emits its own
// config version and calculated timestamp and never carries a run id.
export function sectionBackedEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'section_backed_result',
    configVersion: sectionNumber(section, 'configVersion'),
    runId: null,
    lastCalculatedAt: sectionString(section, 'calculatedAt'),
    publishedVersion: lifecycle.publishedVersion ?? null,
    source: getSectionSource(section) ?? 'fund_snapshots',
  };
}

// Waterfall Setup: published configuration, not a calculation run. Shows the
// published timestamp and the fund_config source, never a run id or freshness.
export function configBackedEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'config_backed_setup',
    configVersion: sectionNumber(section, 'configVersion'),
    runId: null,
    lastCalculatedAt: sectionString(section, 'publishedAt'),
    publishedVersion: lifecycle.publishedVersion ?? null,
    source: getSectionSource(section) ?? 'fund_config',
  };
}

// Overview/Scorecard: assembled from multiple per-field sources. The label is
// derived from the sources actually present so it never claims a source that
// contributed no field.
export function deriveScorecardSources(payload: unknown): string[] {
  if (payload == null || typeof payload !== 'object') return ['funds'];
  const seen: string[] = [];
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (value != null && typeof value === 'object' && 'source' in value) {
      const source = (value as { source?: unknown }).source;
      if (typeof source === 'string' && source.length > 0 && !seen.includes(source)) {
        seen.push(source);
      }
    }
  }
  return seen.length > 0 ? seen : ['funds'];
}

export function mixedScorecardEvidence(
  lifecycle: EvidenceHeaderLifecycle,
  section: SectionLike
): EvidenceHeaderLifecycle | undefined {
  if (section.status !== 'available') return undefined;
  return {
    status: lifecycle.status,
    provenanceLevel: 'mixed_scorecard_sources',
    configVersion: null,
    runId: null,
    lastCalculatedAt: null,
    publishedVersion: null,
    source: null,
    sourceLabel: deriveScorecardSources(section.payload).join(' / '),
  };
}

export function getLifecycleDiagnostic(lifecycle: FundStateReadV1) {
  const { configState, calculationState } = lifecycle;
  const publishedVersion =
    configState.publishedVersion != null
      ? `v${configState.publishedVersion}`
      : 'an unpublished draft';
  const runLabel =
    calculationState.runId != null ? `run ${calculationState.runId}` : 'the next calculation run';

  if (!configState.hasPublished) {
    return {
      tone: 'neutral' as const,
      title: 'No published configuration yet',
      description:
        'This fund does not have a published configuration yet, so authoritative calculations have not started. Publish a configuration before relying on lifecycle-backed results.',
    };
  }

  if (calculationState.status === 'failed') {
    return {
      tone: 'danger' as const,
      title: 'Published configuration exists, but the latest calculation failed',
      description: `${publishedVersion} is published, but ${runLabel} did not complete successfully. Review the latest calculation error and retry once the issue is resolved.`,
    };
  }

  if (calculationState.status === 'submitted' || calculationState.status === 'calculating') {
    return {
      tone: 'warning' as const,
      title: 'Calculation is in progress',
      description: `${publishedVersion} is currently being processed under ${runLabel}. The page will keep polling the results endpoint until the lifecycle reaches a terminal state.`,
    };
  }

  if (hasStaleEvidence(lifecycle)) {
    return {
      tone: 'warning' as const,
      title: 'Published configuration is ahead of the current calculation',
      description: `The latest publish is ${publishedVersion}, but the current evidence is still tied to v${calculationState.configVersion}. Recalculate to bring the displayed results back in sync.`,
    };
  }

  if (calculationState.status === 'ready') {
    return {
      tone: 'success' as const,
      title: 'Results are current',
      description: `${publishedVersion} has a completed calculation run, and the results page is showing current server-backed evidence for that publish.`,
    };
  }

  return {
    tone: 'neutral' as const,
    title: 'Calculation has not been requested',
    description: `${publishedVersion} is published, but no calculation run has been requested yet.`,
  };
}
