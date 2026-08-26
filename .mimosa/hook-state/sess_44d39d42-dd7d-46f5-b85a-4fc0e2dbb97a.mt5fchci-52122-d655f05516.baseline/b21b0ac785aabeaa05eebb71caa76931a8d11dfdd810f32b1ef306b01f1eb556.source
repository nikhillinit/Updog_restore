import { Button } from '@/components/ui/button';
import type {
  AllocationCompanyActualsDriftV1,
  AllocationDriftComparisonV1,
} from '@shared/contracts/allocations/allocation-actuals-drift-v1.contract';

interface AllocationActualsDisclosureProps {
  drift: AllocationCompanyActualsDriftV1;
  companyName: string;
}

const BASIS_LABELS: Record<AllocationDriftComparisonV1['basis'], string> = {
  deployed_reserves_vs_observed_follow_on: 'Deployed reserves vs observed follow-on',
  legacy_invested_vs_observed_total: 'Legacy invested vs observed total',
};

const UNAVAILABLE_REASON_LABELS: Record<
  NonNullable<AllocationDriftComparisonV1['unavailableReason']>,
  string
> = {
  currency_blocked: 'currency blocked',
  facts_failed: 'facts failed',
  facts_missing: 'facts missing',
};

function formatCentString(value: string | null): string {
  if (value === null) {
    return 'Unavailable';
  }

  const cents = BigInt(value);
  const isNegative = cents < 0n;
  const absoluteCents = isNegative ? -cents : cents;
  const dollars = absoluteCents / 100n;
  const remainder = (absoluteCents % 100n).toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${remainder}`;
}

function formatRelativeDelta(value: string | null): string {
  if (value === null) {
    return 'Unavailable';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function ComparisonState({ comparison }: { comparison: AllocationDriftComparisonV1 }) {
  if (comparison.state === 'unavailable') {
    const label = comparison.unavailableReason
      ? UNAVAILABLE_REASON_LABELS[comparison.unavailableReason]
      : 'unavailable';

    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
        />
        <span>{label}</span>
      </span>
    );
  }

  if (comparison.material) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pov-charcoal">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
        <span>material drift</span>
      </span>
    );
  }

  if (comparison.state === 'drifted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-charcoal-500">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
        <span>drift disclosed</span>
      </span>
    );
  }

  return <span className="text-xs font-medium text-pov-charcoal">exact</span>;
}

function EvidenceState({
  label,
  caveated = false,
  unavailable = false,
}: {
  label: string;
  caveated?: boolean;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <span className="inline-flex items-center gap-1.5 text-charcoal-500">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
        />
        <span>{label}</span>
      </span>
    );
  }

  if (caveated) {
    return (
      <span className="inline-flex items-center gap-1.5 text-charcoal-500">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
        <span>{label}</span>
      </span>
    );
  }

  return <span className="font-medium text-pov-charcoal">{label}</span>;
}

function unavailableFactsReason(drift: AllocationCompanyActualsDriftV1): string | null {
  if (drift.trustState === 'FAILED') {
    return drift.warnings[0]?.message ?? 'facts failed';
  }

  if (drift.trustState === 'UNAVAILABLE') {
    return drift.currencyStatus === 'mismatch_blocked' ? 'currency blocked' : 'facts unavailable';
  }

  return null;
}

export function AllocationActualsDisclosure({
  drift,
  companyName,
}: AllocationActualsDisclosureProps) {
  const factsUnavailableReason = unavailableFactsReason(drift);
  const factsInputHash = drift.factsInputHash;
  const trustIsUnavailable = drift.trustState === 'UNAVAILABLE' || drift.trustState === 'FAILED';
  const trustIsCaveated = drift.trustState === 'PARTIAL';
  const currencyLabel =
    drift.currencyStatus === 'mismatch_blocked'
      ? 'currency blocked'
      : drift.currencyStatus.replace('_', ' ');

  return (
    <section
      aria-label={`${companyName} plan versus actual details`}
      className="space-y-4 border-y border-beige-200 bg-pov-gray/40 px-4 py-4 text-sm text-charcoal-500"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 className="font-semibold text-pov-charcoal">Plan vs actual</h3>
          <p className="text-xs text-charcoal-500">{companyName}</p>
        </div>
        <p className="text-xs text-charcoal-500">As of {drift.asOfDate}</p>
      </div>

      {factsUnavailableReason ? (
        <p className="flex items-center gap-1.5 text-sm text-charcoal-500">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
          />
          <span>Facts unavailable: {factsUnavailableReason}</span>
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-beige-200 text-xs text-charcoal-500">
              <th className="px-2 py-2 font-medium">Comparison basis</th>
              <th className="px-2 py-2 text-right font-medium">Plan</th>
              <th className="px-2 py-2 text-right font-medium">Actual</th>
              <th className="px-2 py-2 text-right font-medium">Delta</th>
              <th className="px-2 py-2 text-right font-medium">Relative delta</th>
              <th className="px-2 py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {drift.comparisons.map((comparison) => (
              <tr key={comparison.basis} className="border-b border-beige-200/70 last:border-b-0">
                <th className="px-2 py-3 font-medium text-pov-charcoal">
                  {BASIS_LABELS[comparison.basis]}
                  {comparison.subCentRemainder !== null ? (
                    <span className="mt-1 block text-xs font-normal text-charcoal-500">
                      sub-cent remainder: {comparison.subCentRemainder}
                    </span>
                  ) : null}
                </th>
                <td className="px-2 py-3 text-right">
                  <span className="tabular-nums text-pov-charcoal">
                    {formatCentString(comparison.planCents)}
                  </span>
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="tabular-nums">{formatCentString(comparison.actualCents)}</span>
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="tabular-nums">{formatCentString(comparison.deltaCents)}</span>
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="tabular-nums">
                    {formatRelativeDelta(comparison.relativeDelta)}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <ComparisonState comparison={comparison} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 border-t border-beige-200 pt-3" aria-label="Actuals evidence">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs uppercase text-charcoal-500">Source</div>
            <div className="text-pov-charcoal">Live fund company actuals facts</div>
          </div>
          <div>
            <div className="text-xs uppercase text-charcoal-500">Trust state</div>
            <EvidenceState
              label={drift.trustState}
              caveated={trustIsCaveated}
              unavailable={trustIsUnavailable}
            />
          </div>
          <div>
            <div className="text-xs uppercase text-charcoal-500">Planning FMV status</div>
            <EvidenceState
              label={drift.planningFmvStatus.replace('_', ' ')}
              caveated={
                drift.planningFmvStatus === 'stale' || drift.planningFmvStatus === 'blocked'
              }
              unavailable={drift.planningFmvStatus === 'none'}
            />
          </div>
          <div>
            <div className="text-xs uppercase text-charcoal-500">Currency status</div>
            <EvidenceState
              label={currencyLabel}
              caveated={drift.currencyStatus === 'mismatch_blocked'}
              unavailable={drift.currencyStatus === 'unknown'}
            />
          </div>
          <div>
            <div className="text-xs uppercase text-charcoal-500">As-of date</div>
            <div className="tabular-nums text-pov-charcoal">{drift.asOfDate}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-charcoal-500">Allocation version</div>
            <div className="tabular-nums text-pov-charcoal">v{drift.allocationVersion}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs uppercase text-charcoal-500">Facts input hash</div>
            {factsInputHash ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs text-pov-charcoal">{factsInputHash.slice(0, 12)}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-pov-charcoal"
                  aria-label="Copy facts input hash"
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
              <EvidenceState label="unavailable" unavailable />
            )}
          </div>
        </div>

        {drift.supersedeLineage.length > 0 ? (
          <p className="text-xs text-charcoal-500">
            Supersede lineage: {drift.supersedeLineage.length}{' '}
            {drift.supersedeLineage.length === 1 ? 'record' : 'records'}
          </p>
        ) : null}

        {drift.warnings.length > 0 ? (
          <div>
            <div className="text-xs uppercase text-charcoal-500">Warnings</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-charcoal-500">
              {drift.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
