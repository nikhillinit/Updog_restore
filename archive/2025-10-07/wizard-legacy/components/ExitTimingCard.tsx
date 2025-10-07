/**
 * Exit Timing Card
 *
 * Configures expected years to exit by stage.
 * Used in portfolio modeling to project when exits will occur.
 */

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

export type Stage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

export type ExitTiming = Record<Stage, number>;

interface ExitTimingCardProps {
  /** Exit timing in years by stage (1-10 years) */
  timing: ExitTiming;

  /** Callback when timing changes */
  onChange: (timing: ExitTiming) => void;

  /** Whether the card is in a disabled state */
  disabled?: boolean;

  /** Optional class name */
  className?: string;
}

interface StageConfig {
  key: Stage;
  label: string;
  description: string;
  typicalRange: [number, number]; // [min, max] years
  color: string;
}

const STAGE_CONFIGS: StageConfig[] = [
  {
    key: 'preSeed',
    label: 'Pre-Seed',
    description: 'Earliest stage exits (acqui-hires, pivots)',
    typicalRange: [2, 4],
    color: 'bg-blue-500',
  },
  {
    key: 'seed',
    label: 'Seed',
    description: 'Seed-stage exits (strategic acquisitions)',
    typicalRange: [3, 5],
    color: 'bg-cyan-500',
  },
  {
    key: 'seriesA',
    label: 'Series A',
    description: 'Series A exits (M&A, secondary sales)',
    typicalRange: [4, 6],
    color: 'bg-green-500',
  },
  {
    key: 'seriesB',
    label: 'Series B',
    description: 'Series B exits (strategic buyers)',
    typicalRange: [5, 7],
    color: 'bg-yellow-500',
  },
  {
    key: 'seriesC',
    label: 'Series C',
    description: 'Series C exits (late-stage M&A)',
    typicalRange: [6, 8],
    color: 'bg-orange-500',
  },
  {
    key: 'seriesD',
    label: 'Series D+',
    description: 'Late-stage exits (IPO, major acquisition)',
    typicalRange: [7, 10],
    color: 'bg-red-500',
  },
];

export function ExitTimingCard({
  timing,
  onChange,
  disabled = false,
  className,
}: ExitTimingCardProps) {
  // Calculate average exit time
  const avgExitTime = useMemo(() => {
    const values = Object.values(timing);
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }, [timing]);

  // Handle slider change
  const handleChange = (key: Stage, value: number[]) => {
    onChange({ ...timing, [key]: value[0] });
  };

  // Apply typical timing preset
  const applyPreset = (preset: 'aggressive' | 'moderate' | 'conservative') => {
    const multipliers = {
      aggressive: 0.7,  // 30% faster exits
      moderate: 1.0,    // Default timing
      conservative: 1.3, // 30% slower exits
    };

    const multiplier = multipliers[preset];

    const newTiming: ExitTiming = {
      preSeed: Math.round(3 * multiplier),
      seed: Math.round(4 * multiplier),
      seriesA: Math.round(5 * multiplier),
      seriesB: Math.round(6 * multiplier),
      seriesC: Math.round(7 * multiplier),
      seriesD: Math.round(8 * multiplier),
    };

    // Clamp to valid ranges (1-10 years)
    Object.keys(newTiming).forEach(key => {
      const stage = key as Stage;
      newTiming[stage] = Math.max(1, Math.min(10, newTiming[stage]));
    });

    onChange(newTiming);
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Exit Timing</CardTitle>
            <CardDescription>Expected years to exit by investment stage</CardDescription>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-2 text-gray-900">
              <Clock className="h-5 w-5" />
              <span className="text-2xl font-bold">{avgExitTime.toFixed(1)}</span>
            </div>
            <p className="text-xs text-gray-600">Avg exit time (years)</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Timing Presets */}
        <div className="space-y-3">
          <label className="block font-semibold text-sm text-gray-900">Quick Presets</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => applyPreset('aggressive')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-green-900">Aggressive</p>
              <p className="text-xs text-green-700 mt-1">3-6 years</p>
            </button>

            <button
              onClick={() => applyPreset('moderate')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-blue-900">Moderate</p>
              <p className="text-xs text-blue-700 mt-1">4-8 years</p>
            </button>

            <button
              onClick={() => applyPreset('conservative')}
              disabled={disabled}
              className="px-4 py-3 rounded-lg border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50 text-center"
            >
              <p className="font-semibold text-sm text-gray-900">Conservative</p>
              <p className="text-xs text-gray-700 mt-1">5-10 years</p>
            </button>
          </div>
        </div>

        {/* Stage Sliders */}
        <div className="space-y-4">
          {STAGE_CONFIGS.map(config => (
            <ExitTimingSlider
              key={config.key}
              config={config}
              value={timing[config.key]}
              onChange={value => handleChange(config.key, [value])}
              disabled={disabled}
            />
          ))}
        </div>

        {/* Timeline Visualization */}
        <div className="pt-4 border-t border-gray-200">
          <h4 className="font-semibold text-sm text-gray-700 mb-3">Exit Timeline</h4>
          <div className="relative h-20">
            {/* Timeline axis */}
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-gray-200" />

            {/* Year markers */}
            <div className="absolute inset-x-0 top-1/2 flex justify-between">
              {[0, 2, 4, 6, 8, 10].map(year => (
                <div key={year} className="relative">
                  <div className="absolute h-2 w-0.5 bg-gray-400 -translate-x-1/2 -translate-y-1/2" />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-gray-600">
                    {year}y
                  </div>
                </div>
              ))}
            </div>

            {/* Stage markers */}
            {STAGE_CONFIGS.map(config => {
              const years = timing[config.key];
              const position = (years / 10) * 100; // Percentage position

              return (
                <div
                  key={config.key}
                  className="absolute top-0"
                  style={{ left: `${position}%` }}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full -translate-x-1/2 flex items-center justify-center text-white text-xs font-bold shadow-lg',
                      config.color
                    )}
                    title={`${config.label}: ${years} years`}
                  >
                    {years}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-gray-200">
          <div className="text-center p-3 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-600 mb-1">Shortest Exit</p>
            <p className="font-bold text-lg">
              {Math.min(...Object.values(timing))} years
            </p>
          </div>

          <div className="text-center p-3 rounded-lg bg-gray-50">
            <p className="text-xs text-gray-600 mb-1">Average Exit</p>
            <p className="font-bold text-lg">{avgExitTime.toFixed(1)} years</p>
          </div>

          <div className="text-center p-3 rounded-lg bg-gray-50 col-span-2 md:col-span-1">
            <p className="text-xs text-gray-600 mb-1">Longest Exit</p>
            <p className="font-bold text-lg">
              {Math.max(...Object.values(timing))} years
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ExitTimingSliderProps {
  config: StageConfig;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}

function ExitTimingSlider({ config, value, onChange, disabled }: ExitTimingSliderProps) {
  const isInTypicalRange = value >= config.typicalRange[0] && value <= config.typicalRange[1];

  return (
    <div className="space-y-2">
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
          <span className="font-bold text-lg tabular-nums">{value}</span>
          <span className="text-xs text-gray-500">years</span>
          {!isInTypicalRange && (
            <span className="text-xs text-amber-600 font-medium">
              (atypical)
            </span>
          )}
        </div>
      </div>

      {/* Slider */}
      <div className="relative">
        <Slider
          value={[value]}
          onValueChange={values => onChange(values[0])}
          min={1}
          max={10}
          step={0.5}
          disabled={disabled}
        />

        {/* Typical range indicator */}
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>1 year</span>
          <span className="text-green-600">
            Typical: {config.typicalRange[0]}-{config.typicalRange[1]}y
          </span>
          <span>10 years</span>
        </div>
      </div>
    </div>
  );
}
