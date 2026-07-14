import { Button } from '@/components/ui/button';
import { DecisionStateBadge } from '@/components/fund-results/DecisionStateBadge';
import type { FundMoicFactsBasisV1 } from '@shared/contracts/fund-moic-v1.contract';

interface MoicBasisDisclosureProps {
  basis: FundMoicFactsBasisV1 | null;
  investmentName: string;
}

interface MoicRankabilityBadgeProps {
  basis: FundMoicFactsBasisV1 | null;
}

type FactsBasisReason = FundMoicFactsBasisV1['reasons'][number];

const REASON_COPY: Record<FactsBasisReason, string> = {
  planning_fmv_active: 'An active Planning FMV supports this ranking.',
  planning_fmv_stale: 'Refresh the stale Planning FMV before relying on this ranking.',
  legacy_current_valuation_fallback:
    'Add a current Planning FMV before relying on the legacy valuation fallback.',
  valuation_unavailable: 'Add a current Planning FMV before relying on this ranking.',
  currency_blocked: 'Resolve the currency mismatch before relying on this ranking.',
  planned_reserves_zero: 'Add planned reserves before relying on this ranking.',
  exit_probability_missing: 'Add an exit probability before relying on this ranking.',
  reserve_exit_multiple_missing: 'Add a reserve exit multiple before relying on this ranking.',
};

const PLANNING_FMV_STATUS_COPY: Record<FundMoicFactsBasisV1['planningFmvStatus'], string> = {
  none: 'No Planning FMV',
  active: 'Active Planning FMV',
  superseded: 'Superseded Planning FMV',
  stale: 'Stale Planning FMV',
  blocked: 'Planning FMV blocked',
};

const CURRENCY_STATUS_COPY: Record<FundMoicFactsBasisV1['currencyStatus'], string> = {
  base_currency: 'Base currency',
  mismatch_blocked: 'Currency mismatch blocked',
  unknown: 'Currency unknown',
};

const VALUATION_ANCHOR_COPY: Record<FundMoicFactsBasisV1['valuationAnchor']['kind'], string> = {
  planning_fmv: 'Planning FMV',
  legacy_current_valuation: 'Legacy current valuation',
  none: 'No valuation anchor',
};

const FACTS_UNAVAILABLE_COPY =
  'Facts unavailable. The ranking value is retained, but its supporting facts basis could not be loaded.';

function formatBaseCurrencyAmount(value: string | null): string {
  if (value === null) {
    return 'Unavailable';
  }

  const match = /^(?<sign>-?)(?<integer>\d+)(?:\.(?<fraction>\d{1,6}))?$/.exec(value);
  if (!match?.groups) {
    return 'Unavailable';
  }

  const fraction = (match.groups['fraction'] ?? '').padEnd(3, '0');
  let magnitudeInCents = BigInt(match.groups['integer']) * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= '5') {
    magnitudeInCents += 1n;
  }

  const wholeUnits = magnitudeInCents / 100n;
  const cents = (magnitudeInCents % 100n).toString().padStart(2, '0');
  const sign = match.groups['sign'] === '-' && magnitudeInCents !== 0n ? '-' : '';
  const groupedWholeUnits = wholeUnits.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign}${groupedWholeUnits}.${cents}`;
}

function reasonCopy(basis: FundMoicFactsBasisV1 | null): string[] {
  return basis === null
    ? [FACTS_UNAVAILABLE_COPY]
    : basis.reasons.map((reason) => REASON_COPY[reason]);
}

/**
 * Thin domain adapter over the generic DecisionStateBadge (design decision
 * D-G): `facts_unavailable` is a MOIC domain LABEL mapped onto the
 * not_actionable presentation, not a fourth generic state. Remediation copy
 * keeps the deterministic `basis.reasons` order.
 */
export function MoicRankabilityBadge({ basis }: MoicRankabilityBadgeProps) {
  if (basis === null) {
    return (
      <DecisionStateBadge
        state="not_actionable"
        label="Facts unavailable"
        details={[FACTS_UNAVAILABLE_COPY]}
        testIdPrefix="moic-rankability"
      />
    );
  }
  return (
    <DecisionStateBadge
      state={basis.rankability}
      details={reasonCopy(basis)}
      testIdPrefix="moic-rankability"
    />
  );
}

function EvidenceField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-charcoal-500">{label}</div>
      <div className="mt-1 text-pov-charcoal">{children}</div>
    </div>
  );
}

export function MoicBasisDisclosure({ basis, investmentName }: MoicBasisDisclosureProps) {
  if (basis === null) {
    return (
      <section
        aria-label={`${investmentName} MOIC facts basis`}
        className="space-y-3 border-y border-beige-200 bg-pov-gray/40 px-4 py-4 text-sm text-charcoal-500"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-pov-charcoal">Facts basis</h3>
            <p className="text-xs text-charcoal-500">{investmentName}</p>
          </div>
          <MoicRankabilityBadge basis={null} />
        </div>
        <p>{FACTS_UNAVAILABLE_COPY}</p>
      </section>
    );
  }

  const reasons = reasonCopy(basis);
  const anchor = basis.valuationAnchor;
  const factsInputHash = basis.factsInputHash;

  return (
    <section
      aria-label={`${investmentName} MOIC facts basis`}
      className="space-y-4 border-y border-beige-200 bg-pov-gray/40 px-4 py-4 text-sm text-charcoal-500"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-pov-charcoal">Facts basis</h3>
          <p className="text-xs text-charcoal-500">{investmentName}</p>
        </div>
        <MoicRankabilityBadge basis={basis} />
      </div>

      <div>
        <div className="text-xs uppercase text-charcoal-500">Why this state</div>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-charcoal-500">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 border-t border-beige-200 pt-3 sm:grid-cols-3">
        <EvidenceField label="Observed initial investment (base currency)">
          <span className="tabular-nums">
            {formatBaseCurrencyAmount(basis.observedInitialInvestment)}
          </span>
        </EvidenceField>
        <EvidenceField label="Observed follow-on investment (base currency)">
          <span className="tabular-nums">
            {formatBaseCurrencyAmount(basis.observedFollowOnInvestment)}
          </span>
        </EvidenceField>
        <EvidenceField label="Observed total investment (base currency)">
          <span className="tabular-nums">
            {formatBaseCurrencyAmount(basis.observedTotalInvestment)}
          </span>
        </EvidenceField>
      </div>

      <div className="grid gap-3 border-t border-beige-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <EvidenceField label="Valuation anchor">{VALUATION_ANCHOR_COPY[anchor.kind]}</EvidenceField>
        <EvidenceField label="Anchor value (base currency)">
          <span className="tabular-nums">{formatBaseCurrencyAmount(anchor.value)}</span>
        </EvidenceField>
        <EvidenceField label="Anchor as-of date">
          <span className="tabular-nums">{anchor.asOfDate ?? 'Unavailable'}</span>
        </EvidenceField>
        <EvidenceField label="Planning FMV status">
          {PLANNING_FMV_STATUS_COPY[basis.planningFmvStatus]}
        </EvidenceField>
        <EvidenceField label="Currency status">
          {CURRENCY_STATUS_COPY[basis.currencyStatus]}
        </EvidenceField>
        <EvidenceField label="Facts input hash">
          {factsInputHash ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs text-pov-charcoal">{factsInputHash.slice(0, 12)}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-pov-charcoal"
                aria-label={`Copy facts input hash for ${investmentName}`}
                onClick={() => {
                  if (!navigator.clipboard) {
                    return;
                  }
                  void navigator.clipboard.writeText(factsInputHash).catch(() => undefined);
                }}
              >
                Copy full hash
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-charcoal-500">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
              />
              Unavailable
            </span>
          )}
        </EvidenceField>
      </div>

      <div className="border-t border-beige-200 pt-3">
        <div className="text-xs uppercase text-charcoal-500">Warnings</div>
        {basis.warnings.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-charcoal-500">
            {basis.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-charcoal-500">None</p>
        )}
      </div>
    </section>
  );
}
