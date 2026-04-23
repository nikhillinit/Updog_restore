/**
 * Stage Allocation Card
 *
 * Allows users to allocate capital across investment stages using sliders.
 * Enforces 100% allocation constraint with live validation and visual feedback.
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { formatPct, formatUSDShort, pctOfDollars } from '@/lib/formatting';
import { cn } from '@/lib/utils';

export type Stage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

export interface StageAllocation {
  preSeed: number;
  seed: number;
  seriesA: number;
  seriesB: number;
  seriesC: number;
  seriesD: number;
  reserves: number;
}

interface StageAllocationCardProps {
  /** Current allocation percentages (0-100 scale) */
  allocation: StageAllocation;

  /** Callback when allocation changes */
  onChange: (allocation: StageAllocation) => void;

  /** Total committed capital in whole dollars (for preview) */
  committedCapital?: number;

  /** Whether the card is in a disabled state */
  disabled?: boolean;

  /** Optional class name */
  className?: string;
}

interface StageConfig {
  key: keyof StageAllocation;
  label: string;
  description: string;
  color: string;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    key: 'preSeed',
    label: 'Pre-Seed',
    description: 'Earliest stage companies (idea/prototype)',
    color: 'bg-blue-500',
  },
  {
    key: 'seed',
    label: 'Seed',
    description: 'Product-market fit validation',
    color: 'bg-cyan-500',
  },
  {
    key: 'seriesA',
    label: 'Series A',
    description: 'Scaling proven business model',
    color: 'bg-green-500',
  },
  {
    key: 'seriesB',
    label: 'Series B',
    description: 'Rapid growth and expansion',
    color: 'bg-yellow-500',
  },
  {
    key: 'seriesC',
    label: 'Series C',
    description: 'Market leadership and optimization',
    color: 'bg-orange-500',
  },
  {
    key: 'seriesD',
    label: 'Series D+',
    description: 'Late-stage growth and pre-IPO',
    color: 'bg-red-500',
  },
];

const RESERVES_CONFIG: StageConfig = {
  key: 'reserves',
  label: 'Reserves',
  description: 'Follow-on capital for existing portfolio',
  color: 'bg-purple-500',
};

export function StageAllocationCard({
  allocation,
  onChange,
  committedCapital,
  disabled = false,
  className,
}: StageAllocationCardProps) {
  // Calculate total allocation
  const totalPct = useMemo(() => {
    return (
      allocation.preSeed +
      allocation.seed +
      allocation.seriesA +
      allocation.seriesB +
      allocation.seriesC +
      allocation.seriesD +
      allocation.reserves
    );
  }, [allocation]);

  // Validation state
  const isValid = Math.abs(totalPct - 100) < 0.1; // Allow small floating point errors
  const remaining = 100 - totalPct;

  // Handle slider change
  const handleSliderChange = (key: keyof StageAllocation, value: number[]) => {
    const newValue = value[0];
    onChange({
      ...allocation,
      [key]: newValue,
    });
  };

  // Auto-distribute remaining to other stages
  const handleQuickFill = () => {
    if (isValid) return;

    const keys = [...STAGE_CONFIGS, RESERVES_CONFIG].map(c => c.key);
    const nonZeroKeys = keys.filter(k => allocation[k] > 0);

    if (nonZeroKeys.length === 0) {
      // Default distribution: 30% seed, 40% Series A, 30% reserves
      onChange({
        preSeed: 0,
        seed: 30,
        seriesA: 40,
        seriesB: 0,
        seriesC: 0,
        seriesD: 0,
        reserves: 30,
      });
      return;
    }

    // Distribute remaining proportionally
    const totalNonZero = nonZeroKeys.reduce((sum, k) => sum + allocation[k], 0);
    const newAllocation = { ...allocation };

    nonZeroKeys.forEach(key => {
      const proportion = allocation[key] / totalNonZero;
      newAllocation[key] = Math.round(proportion * 100 * 10) / 10; // Round to 1 decimal
    });

    // Adjust for rounding errors
    const newTotal = Object.values(newAllocation).reduce((sum, v) => sum + v, 0);
    const adjustment = 100 - newTotal;
    if (Math.abs(adjustment) > 0) {
      const firstNonZero = nonZeroKeys[0];
      newAllocation[firstNonZero] += adjustment;
    }

    onChange(newAllocation);
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <CardTitle>Stage Allocation</CardTitle>
        <CardDescription>
          Allocate your fund's capital across investment stages. Total must equal 100%.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Validation Banner */}
        <div
          className={cn(
            'rounded-lg border p-4 transition-all',
            isValid
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center font-bold text-lg',
                  isValid ? 'bg-green-200 text-green-900' : 'bg-amber-200 text-amber-900'
                )}
              >
                {formatPct(totalPct, 0)}%
              </div>
              <div>
                <p className="font-semibold">
                  {isValid ? '✓ Allocation Complete' : 'Allocation In Progress'}
                </p>
                <p className="text-sm">
                  {isValid
                    ? 'Your allocation totals 100%'
                    : `${Math.abs(remaining).toFixed(1)}% ${remaining > 0 ? 'remaining' : 'over'}`}
                </p>
              </div>
            </div>

            {!isValid && (
              <button
                onClick={handleQuickFill}
                disabled={disabled}
                className="px-4 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
              >
                Auto-Fill to 100%
              </button>
            )}
          </div>
        </div>

        {/* Stage Sliders */}
        <div className="space-y-4">
          {STAGE_CONFIGS.map(config => (
            <StageSlider
              key={config.key}
              config={config}
              value={allocation[config.key]}
              onChange={value => handleSliderChange(config.key, [value])}
              committedCapital={committedCapital}
              disabled={disabled}
            />
          ))}

          {/* Reserves Slider (highlighted) */}
          <div className="pt-2 border-t border-gray-200">
            <StageSlider
              config={RESERVES_CONFIG}
              value={allocation.reserves}
              onChange={value => handleSliderChange('reserves', [value])}
              committedCapital={committedCapital}
              disabled={disabled}
              highlighted
            />
          </div>
        </div>

        {/* Allocation Preview */}
        {committedCapital !== undefined && committedCapital > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="font-semibold text-sm text-gray-700 mb-3">Capital Preview</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...STAGE_CONFIGS, RESERVES_CONFIG].map(config => {
                const pct = allocation[config.key];
                const dollars = pctOfDollars(committedCapital, pct);

                return (
                  <div
                    key={config.key}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-gray-50"
                  >
                    <div className={cn('h-2 w-2 rounded-full mb-2', config.color)} />
                    <p className="text-xs text-gray-600 mb-1">{config.label}</p>
                    <p className="font-bold text-sm">{formatUSDShort(dollars)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StageSliderProps {
  config: StageConfig;
  value: number;
  onChange: (value: number) => void;
  committedCapital?: number;
  disabled?: boolean;
  highlighted?: boolean;
}

function StageSlider({
  config,
  value,
  onChange,
  committedCapital,
  disabled = false,
  highlighted = false,
}: StageSliderProps) {
  const dollars = committedCapital ? pctOfDollars(committedCapital, value) : null;

  return (
    <div className={cn('space-y-2', highlighted && 'bg-purple-50 p-3 rounded-lg')}>
      {/* Label Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('h-3 w-3 rounded-full', config.color)} />
          <div>
            <p className="font-medium text-sm text-gray-900">{config.label}</p>
            <p className="text-xs text-gray-500">{config.description}</p>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-bold text-lg tabular-nums">{formatPct(value, 1)}%</span>
          {dollars !== null && (
            <span className="text-xs text-gray-500 tabular-nums">{formatUSDShort(dollars)}</span>
          )}
        </div>
      </div>

      {/* Slider */}
      <Slider
        value={[value]}
        onValueChange={values => onChange(values[0])}
        min={0}
        max={100}
        step={0.1}
        disabled={disabled}
        className={cn(highlighted && 'accent-purple-600')}
      />
    </div>
  );
}
