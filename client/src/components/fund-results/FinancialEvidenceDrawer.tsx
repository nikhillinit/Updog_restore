import { useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { WorkPanel } from '@/components/work-panel/WorkPanel';
import { DecisionStateBadge, type DecisionState } from './DecisionStateBadge';
import type { FinancialEvidence } from './financial-evidence';

export type FinancialEvidenceDrawerStatus = 'ready' | 'loading' | 'empty' | 'failed';

interface FinancialEvidenceDrawerBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  decisionState: DecisionState;
  /** Inline primary reason rendered next to the decision-state badge. */
  decisionReason?: string;
  /** Domain noun for the empty state ("No <noun> disclosed"). */
  factsDomainNoun?: string;
  /** Exactly one proof region; the consuming surface passes it. The panel NEVER fetches. */
  proofSlot?: ReactNode;
  /** AMENDMENT 8: focus is restored to this element when the panel closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Presentation state (AMENDMENT 6 model), discriminated so the compiler
 * rejects the blank-drawer combinations (review P2-1): 'ready' (the default)
 * REQUIRES non-null evidence, and 'failed' REQUIRES a statusReason.
 */
export type FinancialEvidenceDrawerProps = FinancialEvidenceDrawerBaseProps &
  (
    | { status?: 'ready'; evidence: FinancialEvidence; statusReason?: string }
    | { status: 'loading' | 'empty'; evidence: FinancialEvidence | null; statusReason?: string }
    | { status: 'failed'; evidence: FinancialEvidence | null; statusReason: string }
  );

/** Runtime backstop so the failed state never renders a blank reason (D-C). */
const FALLBACK_FAILED_REASON = 'No failure reason disclosed.';

/**
 * D-D content-transition cap: drawer-owned classes cap the sheet slide at
 * 200ms (tailwind-merge keeps the last same-variant duration class). The
 * shared overlay fade stays on the Sheet defaults -- an accepted, logged
 * deviation (AMENDMENT 7) pending global duration normalization.
 */
const DRAWER_TRANSITION_CAP = 'data-[state=closed]:duration-200 data-[state=open]:duration-200';

function EvidenceField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-presson-textMuted">{label}</div>
      <div className="mt-1 text-pov-charcoal">{children}</div>
    </div>
  );
}

function HashField({
  label,
  hash,
  copyLabel,
}: {
  label: string;
  hash: string | null;
  copyLabel: string;
}) {
  return (
    <EvidenceField label={label}>
      {hash === null ? (
        'Not disclosed'
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <code className="text-xs tabular-nums text-pov-charcoal">{hash.slice(0, 12)}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-pov-charcoal motion-reduce:transition-none"
            aria-label={copyLabel}
            onClick={() => {
              if (!navigator.clipboard) {
                return;
              }
              void navigator.clipboard.writeText(hash).catch(() => undefined);
            }}
          >
            Copy full hash
          </Button>
        </span>
      )}
    </EvidenceField>
  );
}

function LoadingBody() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-presson-textMuted">resolving evidence…</p>
      <div className="space-y-2">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            data-testid="evidence-skeleton-row"
            className="animate-pulse rounded bg-beige-200 motion-reduce:animate-none"
          >
            <span aria-hidden="true" className="text-xs tabular-nums text-transparent">
              000000000000
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialEvidenceDrawer({
  open,
  onOpenChange,
  entityLabel,
  status = 'ready',
  statusReason,
  evidence,
  decisionState,
  decisionReason,
  factsDomainNoun = 'facts',
  proofSlot,
  returnFocusRef,
}: FinancialEvidenceDrawerProps) {
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const failed = status === 'failed';
  // D-C: facts FAILED presents as not_actionable, never success-colored.
  const badgeState: DecisionState = failed ? 'not_actionable' : decisionState;
  const failedReason =
    statusReason !== undefined && statusReason.trim() !== ''
      ? statusReason
      : FALLBACK_FAILED_REASON;
  const inlineReason = failed ? failedReason : decisionReason;

  const headerSlot = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
      {evidence?.asOfDate ? (
        <span className="text-xs text-presson-textMuted">
          As of <span className="tabular-nums">{evidence.asOfDate}</span>
        </span>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className="text-xs uppercase text-presson-textMuted">Decision state</span>
        <DecisionStateBadge
          state={badgeState}
          testIdPrefix="evidence-decision"
          {...(failed ? { label: 'Facts unavailable' } : {})}
        />
      </span>
      {inlineReason ? <span className="text-xs text-presson-textMuted">{inlineReason}</span> : null}
    </div>
  );

  let body: ReactNode = null;
  if (status === 'loading') {
    body = <LoadingBody />;
  } else if (status === 'failed') {
    body = (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-pov-charcoal">Facts unavailable</p>
        <p className="text-presson-textMuted">{failedReason}</p>
      </div>
    );
  } else if (status === 'empty') {
    // The as-of date (when available) is disclosed in the header slot above.
    body = <p className="text-sm text-presson-textMuted">No {factsDomainNoun} disclosed</p>;
  } else if (evidence !== null) {
    body = (
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <EvidenceField label="Source">{evidence.source}</EvidenceField>
          <EvidenceField label="Contract version">
            <span className="tabular-nums">{evidence.contractVersion}</span>
          </EvidenceField>
          <EvidenceField label="Source version">
            <span className="tabular-nums">{evidence.sourceVersion ?? 'Unavailable'}</span>
          </EvidenceField>
          <EvidenceField label="Trust state">{evidence.trustState}</EvidenceField>
          <EvidenceField label="Currency status">
            {evidence.currencyStatus ?? 'Unavailable'}
          </EvidenceField>
        </div>
        {proofSlot !== undefined ? (
          <section
            aria-label={`${entityLabel} facts basis`}
            className="border-t border-beige-200 pt-3"
          >
            <h3 className="text-xs font-semibold uppercase text-pov-charcoal">Facts basis</h3>
            <div className="mt-2">{proofSlot}</div>
          </section>
        ) : null}
        <div className="border-t border-beige-200 pt-3">
          <div className="text-xs uppercase text-presson-textMuted">Warnings</div>
          {evidence.warnings.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-presson-textMuted">
              {evidence.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-presson-textMuted">None</p>
          )}
        </div>
        <div className="border-t border-beige-200 pt-3">
          <button
            type="button"
            aria-expanded={provenanceOpen}
            className="text-xs font-semibold uppercase text-pov-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2"
            onClick={() => setProvenanceOpen((current) => !current)}
          >
            Provenance
          </button>
          {provenanceOpen ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <HashField
                label="Facts input hash"
                hash={evidence.factsInputHash}
                copyLabel={`Copy full facts input hash for ${entityLabel}`}
              />
              <HashField
                label="Assumptions hash"
                hash={evidence.assumptionsHash}
                copyLabel={`Copy full assumptions hash for ${entityLabel}`}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <WorkPanel
      open={open}
      onClose={() => onOpenChange(false)}
      title={entityLabel}
      className={DRAWER_TRANSITION_CAP}
      headerSlot={headerSlot}
      {...(returnFocusRef
        ? {
            onCloseAutoFocus: (event: Event) => {
              // Review P2-2: only take over restoration when there is a
              // connected target; otherwise leave Radix's default intact.
              const target = returnFocusRef.current;
              if (target && target.isConnected) {
                event.preventDefault();
                target.focus();
              }
            },
          }
        : {})}
    >
      {body}
    </WorkPanel>
  );
}
