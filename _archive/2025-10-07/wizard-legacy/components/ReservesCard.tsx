/**
 * Reserves Card
 *
 * Explains reserves strategy and allows users to configure follow-on investment policy.
 * Complements StageAllocationCard by providing detailed context on reserves allocation.
 */

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { formatPct, formatUSDShort, pctOfDollars } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, InfoIcon } from 'lucide-react';

export interface ReservesConfig {
  /** Percentage of fund allocated to reserves (0-100 scale) */
  reservesPct: number;

  /** Reserve strategy approach */
  strategy: 'pro_rata' | 'selective' | 'opportunistic';

  /** Target reserve ratio (e.g., 1.5 = reserve $1.50 for every $1 initial) */
  targetReserveRatio?: number;

  /** Maximum number of follow-on rounds per company */
  maxFollowOnRounds?: number;

  /** Reserve for top X% of portfolio */
  topPerformersPct?: number;
}

interface ReservesCardProps {
  /** Current reserves configuration */
  config: ReservesConfig;

  /** Callback when config changes */
  onChange: (config: ReservesConfig) => void;

  /** Total committed capital in whole dollars (for preview) */
  committedCapital?: number;

  /** Whether the card is in a disabled state */
  disabled?: boolean;

  /** Optional class name */
  className?: string;
}

interface StrategyOption {
  key: ReservesConfig['strategy'];
  label: string;
  description: string;
  icon: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    key: 'pro_rata',
    label: 'Pro-Rata',
    description: 'Maintain ownership across all portfolio companies',
    icon: '⚖️',
  },
  {
    key: 'selective',
    label: 'Selective',
    description: 'Focus reserves on top performers (e.g., top 30%)',
    icon: '🎯',
  },
  {
    key: 'opportunistic',
    label: 'Opportunistic',
    description: 'Case-by-case basis, no pre-commitment',
    icon: '🔍',
  },
];

export function ReservesCard({
  config,
  onChange,
  committedCapital,
  disabled = false,
  className,
}: ReservesCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate dollar amount
  const reservesDollars = committedCapital ? pctOfDollars(committedCapital, config.reservesPct) : null;

  // Handle field changes
  const updateConfig = <K extends keyof ReservesConfig>(key: K, value: ReservesConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <Card className={cn('border-purple-200 bg-purple-50', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg">
              {formatPct(config.reservesPct, 0)}%
            </div>
            <div>
              <CardTitle>Reserves Strategy</CardTitle>
              <CardDescription>Follow-on capital for existing portfolio</CardDescription>
            </div>
          </div>

          {reservesDollars !== null && (
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-900">{formatUSDShort(reservesDollars)}</p>
              <p className="text-xs text-purple-700">Available for follow-ons</p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Reserves Explainer */}
        <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-purple-200">
          <InfoIcon className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="font-semibold mb-2">Why Reserves Matter</p>
            <p>
              Reserves protect ownership in winning companies. When portfolio companies raise follow-on rounds,
              having reserves allows you to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
              <li>Maintain ownership percentage (avoid dilution)</li>
              <li>Signal confidence to other investors</li>
              <li>Maximize returns from your best performers</li>
            </ul>
          </div>
        </div>

        {/* Strategy Selection */}
        <div className="space-y-3">
          <label className="block font-semibold text-sm text-gray-900">Reserve Strategy</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {STRATEGY_OPTIONS.map(option => (
              <button
                key={option.key}
                onClick={() => updateConfig('strategy', option.key)}
                disabled={disabled}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all text-left',
                  'hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500',
                  config.strategy === option.key
                    ? 'border-purple-500 bg-purple-100'
                    : 'border-gray-200 bg-white',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="text-2xl mb-2">{option.icon}</div>
                <p className="font-semibold text-sm text-gray-900">{option.label}</p>
                <p className="text-xs text-gray-600 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Options (Collapsible) */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center gap-2 w-full p-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              disabled={disabled}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="font-semibold text-sm">Advanced Reserves Options</span>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4">
            {/* Target Reserve Ratio */}
            {config.strategy === 'pro_rata' && (
              <div className="space-y-2 p-4 bg-white rounded-lg">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-sm text-gray-900">Target Reserve Ratio</label>
                  <span className="font-bold text-lg tabular-nums">
                    {config.targetReserveRatio?.toFixed(1) ?? '1.0'}x
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Reserve ${config.targetReserveRatio?.toFixed(1) ?? '1.0'} for every $1 initial investment
                </p>
                <Slider
                  value={[config.targetReserveRatio ?? 1.0]}
                  onValueChange={values => updateConfig('targetReserveRatio', values[0])}
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  disabled={disabled}
                />
              </div>
            )}

            {/* Top Performers Percentage */}
            {config.strategy === 'selective' && (
              <div className="space-y-2 p-4 bg-white rounded-lg">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-sm text-gray-900">Top Performers</label>
                  <span className="font-bold text-lg tabular-nums">
                    Top {formatPct(config.topPerformersPct ?? 30, 0)}%
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Reserve capital for the top {formatPct(config.topPerformersPct ?? 30, 0)}% of portfolio by performance
                </p>
                <Slider
                  value={[config.topPerformersPct ?? 30]}
                  onValueChange={values => updateConfig('topPerformersPct', values[0])}
                  min={10}
                  max={50}
                  step={5}
                  disabled={disabled}
                />
              </div>
            )}

            {/* Max Follow-On Rounds */}
            <div className="space-y-2 p-4 bg-white rounded-lg">
              <div className="flex items-center justify-between">
                <label className="font-medium text-sm text-gray-900">Max Follow-On Rounds</label>
                <span className="font-bold text-lg tabular-nums">
                  {config.maxFollowOnRounds ?? 3} rounds
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-2">
                Maximum number of follow-on investments per portfolio company
              </p>
              <Slider
                value={[config.maxFollowOnRounds ?? 3]}
                onValueChange={values => updateConfig('maxFollowOnRounds', values[0])}
                min={1}
                max={5}
                step={1}
                disabled={disabled}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Quick Stats */}
        {committedCapital !== undefined && committedCapital > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-purple-200">
            <div className="text-center p-3 rounded-lg bg-white">
              <p className="text-xs text-gray-600 mb-1">Reserves</p>
              <p className="font-bold text-lg">{formatUSDShort(reservesDollars ?? 0)}</p>
            </div>

            <div className="text-center p-3 rounded-lg bg-white">
              <p className="text-xs text-gray-600 mb-1">Initial Investments</p>
              <p className="font-bold text-lg">
                {formatUSDShort(committedCapital - (reservesDollars ?? 0))}
              </p>
            </div>

            <div className="text-center p-3 rounded-lg bg-white col-span-2 md:col-span-1">
              <p className="text-xs text-gray-600 mb-1">Reserve Ratio</p>
              <p className="font-bold text-lg">
                {config.targetReserveRatio?.toFixed(1) ?? '1.0'}x
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
