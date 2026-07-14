/**
 * Generic section availability renderer for the fund model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/SectionRenderer
 */

import React from 'react';
import { EvidenceHeader, type EvidenceHeaderLifecycle } from '@/components/results/EvidenceHeader';
import { reasonCopyFor, sectionEvidence } from './evidence';
import type { SectionLike } from './types';

interface SectionRendererProps {
  title: string;
  section: SectionLike;
  renderPayload?: (payload: unknown) => React.ReactNode;
  evidenceLifecycle?: EvidenceHeaderLifecycle | undefined;
  evidenceTestId?: string;
  /** Plan 9 Wave 9B1 additive: small header affordance (e.g. Evidence link). */
  headerAction?: React.ReactNode;
}

export function SectionRenderer({
  title,
  section,
  renderPayload,
  evidenceLifecycle,
  evidenceTestId,
  headerAction,
}: SectionRendererProps) {
  const evidence = sectionEvidence(evidenceLifecycle, section);

  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <div className="mb-4 space-y-2">
          {headerAction !== undefined ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-charcoal">{title}</h2>
              {headerAction}
            </div>
          ) : (
            <h2 className="text-lg font-medium text-charcoal">{title}</h2>
          )}
          {evidence && <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />}
        </div>
        {section.legacyEvidence && (
          <p className="text-xs text-charcoal-400 mb-2">
            Based on previous calculation (legacy data)
          </p>
        )}
        {renderPayload ? (
          renderPayload(section.payload)
        ) : (
          <pre className="text-sm text-charcoal-600 whitespace-pre-wrap font-mono">
            {JSON.stringify(section.payload, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  const statusLabel =
    section.status === 'failed'
      ? section.reasonCode === 'INVALID_PUBLISHED_CONFIG'
        ? 'Configuration issue'
        : 'Calculation failed'
      : section.status === 'pending'
        ? 'Pending'
        : '';
  const copy = reasonCopyFor(section);

  return (
    <div className="bg-beige-50 rounded-lg border border-beige-200 p-6">
      <div className="mb-2 space-y-2">
        {headerAction !== undefined ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium text-charcoal-400">{title}</h2>
            {headerAction}
          </div>
        ) : (
          <h2 className="text-lg font-medium text-charcoal-400">{title}</h2>
        )}
        {evidence && <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />}
      </div>
      <p className="text-sm text-charcoal-500 font-poppins">
        {statusLabel ? `${statusLabel}: ` : ''}
        {copy}
      </p>
    </div>
  );
}
