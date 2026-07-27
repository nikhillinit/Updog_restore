import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCurrentPositions } from '@/hooks/useCurrentPositions';
import { usePositionValuationSelection } from '@/hooks/usePositionValuationSelection';
import { PremiumCard } from '@/components/ui/PremiumCard';
import type { PositionValuationSelectionV1 } from '@shared/contracts/investment-ledger/current-position.contract';

interface CurrentPositionsPanelProps {
  vehicleId: number;
  companyIdentityId: number;
  companyId: number;
  asOfDate?: string;
}

type PositionComponentV1 = {
  kind: 'priced' | 'contingent';
  shares: string;
  costBasis: string;
  participationIds: number[];
};

function formatNumber(value: string) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number.parseFloat(value));
}

function formatMoney(value: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.parseFloat(value));
}

function basisLabel(selection: PositionValuationSelectionV1 | undefined): string {
  if (!selection) {
    return 'Pending';
  }

  if (selection.basis === 'direct') {
    return selection.directMarkId === null ? 'Direct' : `Direct mark ${selection.directMarkId}`;
  }

  if (selection.basis === 'derived') {
    return selection.derivedTrancheId === null
      ? 'Derived'
      : `Derived from tranche ${selection.derivedTrancheId}`;
  }

  return 'Unavailable';
}

function basisValue(selection: PositionValuationSelectionV1 | undefined): string {
  if (!selection) {
    return 'Pending';
  }

  if (selection.basis === 'unavailable') {
    return 'Unavailable';
  }

  return selection.aggregateFairValue === null
    ? 'Unavailable'
    : formatMoney(selection.aggregateFairValue);
}

function warningMessage(code: string, fallback: string): string {
  if (code === 'CONTINGENT_INSTRUMENT_EXCLUDED') {
    return 'Contingent component is excluded from priced-component valuation.';
  }
  if (code === 'DIRECT_POSITION_MARK_STALE') {
    return 'Mark is older than 120 days and remains the selected direct evidence.';
  }
  if (code === 'POSITION_VALUATION_INCOMPLETE') {
    return 'Aggregate valuation is unavailable because contingent value is not priced.';
  }
  return fallback;
}

function WarningItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-warning-dark">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </li>
  );
}

function PositionComponentTag({ component }: { component: PositionComponentV1 }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
        component.kind === 'priced'
          ? 'bg-success/10 text-success-dark'
          : 'bg-warning/10 text-warning-dark'
      }`}
    >
      {component.kind}
    </span>
  );
}

export function CurrentPositionsPanel({
  vehicleId,
  companyIdentityId,
  companyId,
  asOfDate,
}: CurrentPositionsPanelProps) {
  const positionsQuery = useCurrentPositions({
    vehicleId,
    companyIdentityId,
    ...(asOfDate !== undefined ? { asOfDate } : {}),
  });
  const valuationQuery = usePositionValuationSelection({
    vehicleId,
    companyIdentityId,
    companyId,
    ...(positionsQuery.data?.asOfDate !== undefined && asOfDate === undefined
      ? { asOfDate: positionsQuery.data.asOfDate }
      : asOfDate !== undefined
        ? { asOfDate }
        : {}),
  });

  if (positionsQuery.isLoading) {
    return (
      <PremiumCard>
        <div className="flex items-center justify-center py-10 text-sm text-presson-textMuted" data-testid="positions-loading">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading current positions
        </div>
      </PremiumCard>
    );
  }

  if (positionsQuery.isError) {
    return (
      <PremiumCard>
        <div className="py-8 text-center text-sm text-error" data-testid="positions-error">
          {positionsQuery.error.message}
        </div>
      </PremiumCard>
    );
  }

  const positions = positionsQuery.data?.positions ?? [];

  if (positions.length === 0) {
    return (
      <PremiumCard>
        <div className="py-8 text-center text-sm text-presson-textMuted" data-testid="positions-empty">
          No current positions found for this identity.
        </div>
      </PremiumCard>
    );
  }

  const valuationLoading = valuationQuery.isLoading || valuationQuery.isFetching;
  const selected = valuationQuery.data;

  return (
    <PremiumCard title="Current Positions">
      <div className="space-y-4">
        {valuationQuery.isError ? (
          <div
            className="rounded-lg border border-error/50 bg-error/10 p-3 text-sm text-error-dark"
            data-testid="positions-valuation-error"
            role="alert"
          >
            Position economics loaded, but valuation evidence could not be loaded. No fallback
            value was applied.
          </div>
        ) : null}

        <div className="space-y-3">
          {positions.map((position) => (
            <div
              key={position.companyIdentityId}
              className="rounded-lg border border-presson-borderSubtle bg-white p-4 space-y-3"
              data-testid="position-card"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm text-presson-textMuted">Position shares</div>
                  <div className="font-mono">{formatNumber(position.shares)}</div>
                </div>
                <div>
                  <div className="text-sm text-presson-textMuted">Cost basis</div>
                  <div className="font-mono">{formatMoney(position.costBasis)}</div>
                </div>
                <div>
                  <div className="text-sm text-presson-textMuted">Proceeds</div>
                  <div className="font-mono">{formatMoney(position.proceeds)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {position.components.map((component) => (
                  <PositionComponentTag key={`${position.companyIdentityId}-${component.kind}`} component={component} />
                ))}
              </div>

              <div className="text-sm text-presson-textMuted">
                Valuation basis: {valuationQuery.isError ? 'Unavailable' : basisLabel(selected)}
              </div>
              <div className="text-sm">
                Aggregate position valuation:{' '}
                {valuationQuery.isError
                  ? 'Unavailable'
                  : valuationLoading
                    ? 'Loading'
                    : basisValue(selected)}
              </div>
              {selected?.pricedComponentFairValue !== null &&
              selected?.pricedComponentFairValue !== undefined ? (
                <div className="text-sm" data-testid="priced-component-value">
                  Priced component valuation: {formatMoney(selected.pricedComponentFairValue)}
                </div>
              ) : null}

              <ul className="space-y-1">
                {(selected?.warnings ?? []).map((warning) => (
                  <WarningItem
                    key={warning.code}
                    text={warningMessage(warning.code, warning.message)}
                  />
                ))}
                {position.warnings.map((warning) => (
                  <WarningItem key={warning.code} text={warning.message} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </PremiumCard>
  );
}
