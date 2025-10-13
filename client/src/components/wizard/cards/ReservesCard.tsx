/**
 * Reserves Card (Enhanced with Inline Validation)
 *
 * Configures reserves strategy and follow-on investment policy.
 * Complements StageAllocationCard by providing detailed context on reserves allocation.
 *
 * IMPROVEMENTS:
 * - Uses camelCase for strategy values (proRata vs pro_rata)
 * - Proper radiogroup ARIA semantics for accessibility
 * - Safe math guards for zero/undefined capital
 * - Enhanced help text and context chips
 * - Default imports for consistency
 */

import React from 'react';
import CollapsibleCard from '@/components/wizard/CollapsibleCard';
import EnhancedField from '@/components/wizard/EnhancedField';
import { formatUSD, pctOfDollars } from '@/lib/formatting';
import type { FieldErrors } from '@/lib/validation';
import { firstError } from '@/lib/validation';
import { Info as InfoIcon } from 'lucide-react';

export type ReserveStrategy = 'proRata' | 'selective' | 'opportunistic';

export interface ReserveSettings {
  strategy: ReserveStrategy;
  reserveRatioPct: number; // % of fund for follow-ons (should match stageAllocation.reserves)
  proRataParticipationRatePct: number; // 0-100 (how often you take pro-rata)
  followOnMultiple: number; // average follow-on vs initial check (e.g., 1.5x)
  targetReserveRatio?: number; // For pro-rata strategy
  topPerformersPct?: number; // For selective strategy
  maxFollowOnRounds?: number; // Max rounds per company
}

interface ReservesCardProps {
  /** Current reserves configuration */
  value: ReserveSettings;

  /** Callback when values change */
  onChange: (next: ReserveSettings) => void;

  /** Total committed capital for dollar preview */
  committedCapitalUSD?: number;

  /** Scoped validation errors (keys like "strategy", "reserveRatioPct") */
  errors?: FieldErrors;

  /** Whether the card is disabled */
  disabled?: boolean;

  /** Additional class names */
  className?: string;
}

interface StrategyOption {
  value: ReserveStrategy;
  label: string;
  description: string;
  icon: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    value: 'proRata',
    label: 'Pro-Rata',
    description: 'Maintain ownership across all portfolio companies',
    icon: '⚖️',
  },
  {
    value: 'selective',
    label: 'Selective',
    description: 'Focus reserves on top performers (e.g., top 30%)',
    icon: '🎯',
  },
  {
    value: 'opportunistic',
    label: 'Opportunistic',
    description: 'Case-by-case basis, no pre-commitment',
    icon: '🔍',
  },
];

export function ReservesCard({
  value,
  onChange,
  committedCapitalUSD,
  errors,
  disabled = false,
  className,
}: ReservesCardProps) {
  const updateField = <K extends keyof ReserveSettings>(key: K, val: ReserveSettings[K]) => {
    onChange({ ...value, [key]: val });
  };

  // Safe calculation with guards for zero/undefined capital
  const reservesDollars =
    Number.isFinite(committedCapitalUSD) && (committedCapitalUSD ?? 0) > 0
      ? pctOfDollars(committedCapitalUSD ?? 0, value.reserveRatioPct)
      : 0;

  const summary = (
    <div className="text-sm text-muted-foreground">
      {value.strategy ?? 'proRata'} · Reserves {value.reserveRatioPct.toFixed(0)}% · Pro-rata{' '}
      {value.proRataParticipationRatePct.toFixed(0)}%
    </div>
  );

  return (
    <CollapsibleCard
      title="Reserves Strategy"
      description="Configure follow-on capital allocation for existing portfolio"
      summary={summary}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="space-y-6">
        {/* Explainer */}
        <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <InfoIcon className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-purple-900">
            <p className="font-semibold mb-2">Why Reserves Matter</p>
            <p className="leading-relaxed">
              Reserves protect ownership in winning companies. When portfolio companies raise follow-on
              rounds, having reserves allows you to maintain ownership, signal confidence, and maximize
              returns from your best performers.
            </p>
          </div>
        </div>

        {/* Strategy Selection (Proper Radiogroup) */}
        <div role="radiogroup" aria-labelledby="reserve-strategy-label" className="space-y-3">
          <label id="reserve-strategy-label" className="block font-semibold text-sm text-gray-900">
            Reserve Strategy
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STRATEGY_OPTIONS.map((option) => {
              const selected = value.strategy === option.value;
              return (
                <button
                  key={option.value}
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.label}
                  onClick={() => updateField('strategy', option.value)}
                  disabled={disabled}
                  type="button"
                  className={`p-4 rounded-lg border-2 transition-all text-left focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    selected
                      ? 'border-purple-500 bg-purple-100'
                      : 'border-gray-200 bg-white hover:border-purple-400'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-2xl mb-2">{option.icon}</div>
                  <p className="font-semibold text-sm text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                </button>
              );
            })}
          </div>
          {firstError(errors ?? {}, 'strategy') && (
            <p className="text-xs text-red-600 font-medium mt-1">
              {firstError(errors ?? {}, 'strategy')}
            </p>
          )}
        </div>

        {/* Core Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EnhancedField
            id="reserve-ratio-pct"
            label="Reserve Ratio"
            format="percent"
            value={value.reserveRatioPct}
            onChange={(v: number) => updateField('reserveRatioPct', v)}
            contextChip="Common: 40–60%"
            helpText="% of total fund allocated to follow-on investments"
            {...(firstError(errors ?? {}, 'reserveRatioPct') !== undefined ? { error: firstError(errors ?? {}, 'reserveRatioPct') } : {})}
            disabled={disabled}
          />

          <EnhancedField
            id="prorata-rate"
            label="Pro-Rata Participation Rate"
            format="percent"
            value={value.proRataParticipationRatePct}
            onChange={(v: number) => updateField('proRataParticipationRatePct', v)}
            helpText="How often you exercise your pro-rata rights"
            {...(firstError(errors ?? {}, 'proRataParticipationRatePct') !== undefined ? { error: firstError(errors ?? {}, 'proRataParticipationRatePct') } : {})}
            disabled={disabled}
          />

          <EnhancedField
            id="followon-multiple"
            label="Avg Follow-on / Initial (×)"
            format="number"
            step={0.1}
            min={0}
            value={value.followOnMultiple}
            onChange={(v: number) => updateField('followOnMultiple', v)}
            contextChip="Typical: 1.0–2.0×"
            helpText="Average dollar of follow-on per $1 initial (e.g., 1.5× means 150% of initial)"
            {...(firstError(errors ?? {}, 'followOnMultiple') !== undefined ? { error: firstError(errors ?? {}, 'followOnMultiple') } : {})}
            disabled={disabled}
          />

          <EnhancedField
            id="max-followon-rounds"
            label="Max Follow-On Rounds"
            format="number"
            step={1}
            min={1}
            max={5}
            value={value.maxFollowOnRounds ?? 3}
            onChange={(v: number) => updateField('maxFollowOnRounds', v)}
            helpText="Maximum number of follow-on investments per company"
            {...(firstError(errors ?? {}, 'maxFollowOnRounds') !== undefined ? { error: firstError(errors ?? {}, 'maxFollowOnRounds') } : {})}
            disabled={disabled}
          />
        </div>

        {/* Strategy-Specific Settings */}
        {value.strategy === 'proRata' && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <EnhancedField
              id="target-reserve-ratio"
              label="Target Reserve Ratio"
              format="number"
              step={0.1}
              min={0.5}
              max={3.0}
              value={value.targetReserveRatio ?? 1.0}
              onChange={(v: number) => updateField('targetReserveRatio', v)}
              helpText={`Reserve $${(value.targetReserveRatio ?? 1.0).toFixed(1)} for every $1 initial investment`}
              {...(firstError(errors ?? {}, 'targetReserveRatio') !== undefined ? { error: firstError(errors ?? {}, 'targetReserveRatio') } : {})}
              disabled={disabled}
            />
          </div>
        )}

        {value.strategy === 'selective' && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <EnhancedField
              id="top-performers-pct"
              label="Top Performers %"
              format="percent"
              value={value.topPerformersPct ?? 30}
              onChange={(v: number) => updateField('topPerformersPct', v)}
              contextChip="Common: 20–40%"
              helpText={`Reserve capital for the top ${value.topPerformersPct ?? 30}% of portfolio by performance`}
              {...(firstError(errors ?? {}, 'topPerformersPct') !== undefined ? { error: firstError(errors ?? {}, 'topPerformersPct') } : {})}
              disabled={disabled}
            />
          </div>
        )}

        {/* Quick Stats */}
        {committedCapitalUSD && committedCapitalUSD > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-purple-200">
            <div className="text-center p-3 rounded-lg bg-white border">
              <p className="text-xs text-gray-600 mb-1">Reserves</p>
              <p className="font-bold text-lg">{formatUSD(reservesDollars)}</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-white border">
              <p className="text-xs text-gray-600 mb-1">Initial Investments</p>
              <p className="font-bold text-lg">
                {formatUSD(Math.max(0, (committedCapitalUSD ?? 0) - reservesDollars))}
              </p>
            </div>

            <div className="text-center p-3 rounded-lg bg-white border col-span-2 md:col-span-1">
              <p className="text-xs text-gray-600 mb-1">Follow-on Multiple</p>
              <p className="font-bold text-lg">{(value.followOnMultiple ?? 0).toFixed(1)}×</p>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

export default ReservesCard;
