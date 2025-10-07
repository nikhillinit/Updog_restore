/**
 * Exit Values Card
 *
 * Configures exit values in DOLLARS (not multiples) by stage.
 * Supports low/median/high scenarios with probability weights.
 * Displays computed implied multiples as read-only reference.
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatUSD, formatUSDShort, parseUSDStrict } from '@/lib/formatting';
import { computeImpliedMultiple, computeExpectedExitValue, validateExitDistribution } from '@/lib/exits';
import { cn } from '@/lib/utils';
import { DollarSign, TrendingUp, AlertCircle, InfoIcon } from 'lucide-react';

export type Stage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

export interface ExitValueDistribution {
  median: number;
  low?: number;
  high?: number;
  weights?: {
    low?: number;
    median?: number;
    high?: number;
  };
}

export type ExitValuesByStage = Record<Stage, ExitValueDistribution>;

interface ExitValuesCardProps {
  /** Exit values in whole dollars by stage */
  exitValues: ExitValuesByStage;

  /** Callback when exit values change */
  onChange: (exitValues: ExitValuesByStage) => void;

  /** Average check sizes by stage (for implied multiple calculation) */
  checkSizes?: Partial<Record<Stage, number>>;

  /** Whether the card is in a disabled state */
  disabled?: boolean;

  /** Optional class name */
  className?: string;
}

interface StageConfig {
  key: Stage;
  label: string;
  description: string;
  typicalExit: number; // Typical median exit value in dollars
  color: string;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    key: 'preSeed',
    label: 'Pre-Seed',
    description: 'Acqui-hire, early pivots',
    typicalExit: 5_000_000, // $5M
    color: 'bg-blue-500',
  },
  {
    key: 'seed',
    label: 'Seed',
    description: 'Strategic acquisition',
    typicalExit: 20_000_000, // $20M
    color: 'bg-cyan-500',
  },
  {
    key: 'seriesA',
    label: 'Series A',
    description: 'Growth-stage M&A',
    typicalExit: 50_000_000, // $50M
    color: 'bg-green-500',
  },
  {
    key: 'seriesB',
    label: 'Series B',
    description: 'Strategic buyer',
    typicalExit: 100_000_000, // $100M
    color: 'bg-yellow-500',
  },
  {
    key: 'seriesC',
    label: 'Series C',
    description: 'Late-stage M&A',
    typicalExit: 250_000_000, // $250M
    color: 'bg-orange-500',
  },
  {
    key: 'seriesD',
    label: 'Series D+',
    description: 'IPO, major acquisition',
    typicalExit: 500_000_000, // $500M
    color: 'bg-red-500',
  },
];

export function ExitValuesCard({
  exitValues,
  onChange,
  checkSizes,
  disabled = false,
  className,
}: ExitValuesCardProps) {
  // Apply typical exit values
  const applyPreset = (preset: 'conservative' | 'moderate' | 'optimistic') => {
    const multipliers = {
      conservative: 0.6,  // 40% lower exits
      moderate: 1.0,      // Default values
      optimistic: 1.8,    // 80% higher exits
    };

    const multiplier = multipliers[preset];

    const newExitValues: ExitValuesByStage = {} as ExitValuesByStage;

    STAGE_CONFIGS.forEach(config => {
      const median = Math.round(config.typicalExit * multiplier);
      const low = Math.round(median * 0.5);   // Low = 50% of median
      const high = Math.round(median * 2.0);  // High = 2x median

      newExitValues[config.key] = {
        median,
        low,
        high,
        weights: {
          low: 0.2,
          median: 0.6,
          high: 0.2,
        },
      };
    });

    onChange(newExitValues);
  };

  // Calculate total expected portfolio value
  const totalExpectedValue = useMemo(() => {
    return STAGE_CONFIGS.reduce((sum, config) => {
      const distribution = exitValues[config.key];
      if (!distribution) return sum;

      try {
        return sum + computeExpectedExitValue(distribution);
      } catch {
        return sum;
      }
    }, 0);
  }, [exitValues]);

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Exit Values (Dollar Exits)</CardTitle>
            <CardDescription>
              Enter expected exit values in whole dollars. Implied multiples shown for reference.
            </CardDescription>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-2 text-gray-900">
              <DollarSign className="h-5 w-5" />
              <span className="text-2xl font-bold">{formatUSDShort(totalExpectedValue)}</span>
            </div>
            <p className="text-xs text-gray-600">Total expected value</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <InfoIcon className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Dollar Exits (Not Multiples)</p>
            <p>
              Enter exit values in <strong>whole US dollars</strong> (e.g., 50,000,000 for $50M).
              Implied multiples are computed automatically for reference.
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="space-y-3">
          <label className="block font-semibold text-sm text-gray-900">Quick Presets</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => applyPreset('conservative')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-gray-900">Conservative</p>
              <p className="text-xs text-gray-600 mt-1">$3M-$300M exits</p>
            </button>

            <button
              onClick={() => applyPreset('moderate')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-blue-900">Moderate</p>
              <p className="text-xs text-blue-700 mt-1">$5M-$500M exits</p>
            </button>

            <button
              onClick={() => applyPreset('optimistic')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-green-900">Optimistic</p>
              <p className="text-xs text-green-700 mt-1">$9M-$900M exits</p>
            </button>
          </div>
        </div>

        {/* Stage Exit Value Rows */}
        <div className="space-y-3">
          {STAGE_CONFIGS.map(config => (
            <ExitValueRow
              key={config.key}
              config={config}
              distribution={exitValues[config.key]}
              onChange={newDist => onChange({ ...exitValues, [config.key]: newDist })}
              checkSize={checkSizes?.[config.key]}
              disabled={disabled}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ExitValueRowProps {
  config: StageConfig;
  distribution: ExitValueDistribution;
  onChange: (distribution: ExitValueDistribution) => void;
  checkSize?: number;
  disabled: boolean;
}

function ExitValueRow({ config, distribution, onChange, checkSize, disabled }: ExitValueRowProps) {
  // Validation
  const errors = validateExitDistribution(distribution);
  const hasError = errors.length > 0;

  // Compute implied multiple
  const impliedMultiple = checkSize
    ? computeImpliedMultiple(distribution.median, checkSize)
    : null;

  // Handle input change
  const handleChange = (field: 'low' | 'median' | 'high', input: string) => {
    if (input === '') {
      // Clear optional fields
      if (field !== 'median') {
        onChange({ ...distribution, [field]: undefined });
      }
      return;
    }

    const parsed = parseUSDStrict(input);
    if (parsed !== null) {
      onChange({ ...distribution, [field]: parsed });
    }
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 transition-all',
        hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
      )}
    >
      {/* Stage Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('h-3 w-3 rounded-full', config.color)} />
          <div>
            <p className="font-semibold text-sm text-gray-900">{config.label}</p>
            <p className="text-xs text-gray-500">{config.description}</p>
          </div>
        </div>

        {/* Implied Multiple Badge */}
        {impliedMultiple !== null && (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            <TrendingUp className="h-3 w-3 mr-1" />
            {impliedMultiple.toFixed(1)}x
          </Badge>
        )}
      </div>

      {/* Error Messages */}
      {hasError && (
        <div className="flex items-start gap-2 mb-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Three-Column Grid: Low / Median / High */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Low */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Low Exit</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={distribution.low !== undefined ? formatUSD(distribution.low) : ''}
              onChange={e => handleChange('low', e.target.value)}
              disabled={disabled}
              placeholder="Optional"
              className={cn('pl-6', hasError && 'border-red-300')}
            />
          </div>
        </div>

        {/* Median (Required) */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600 font-semibold">
            Median Exit <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={formatUSD(distribution.median)}
              onChange={e => handleChange('median', e.target.value)}
              disabled={disabled}
              className={cn('pl-6 font-semibold', hasError && 'border-red-300')}
            />
          </div>
        </div>

        {/* High */}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">High Exit</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
            <Input
              type="text"
              inputMode="numeric"
              value={distribution.high !== undefined ? formatUSD(distribution.high) : ''}
              onChange={e => handleChange('high', e.target.value)}
              disabled={disabled}
              placeholder="Optional"
              className={cn('pl-6', hasError && 'border-red-300')}
            />
          </div>
        </div>
      </div>

      {/* Expected Value Preview */}
      {distribution.low !== undefined && distribution.high !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Expected Value (weighted avg):</span>
            <span className="font-bold text-gray-900">
              {formatUSDShort(computeExpectedExitValue(distribution))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
