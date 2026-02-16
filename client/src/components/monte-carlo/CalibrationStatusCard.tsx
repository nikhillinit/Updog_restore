/**
 * CalibrationStatusCard
 *
 * Shows model calibration status with quality score gauge.
 */

import type { CalibrationStatus } from '@shared/types/backtesting';

interface Props {
  calibrationStatus: CalibrationStatus;
  modelQualityScore: number;
}

const STATUS_CONFIG: Record<
  CalibrationStatus,
  { label: string; color: string; bg: string; description: string }
> = {
  'well-calibrated': {
    label: 'Well Calibrated',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    description: 'Model predictions align well with actual performance.',
  },
  'under-predicting': {
    label: 'Under-Predicting',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    description: 'Model tends to underestimate fund performance.',
  },
  'over-predicting': {
    label: 'Over-Predicting',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    description: 'Model tends to overestimate fund performance.',
  },
  'insufficient-data': {
    label: 'Insufficient Data',
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    description: 'Not enough data points to assess calibration.',
  },
};

function QualityGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = clampedScore >= 70 ? '#10b981' : clampedScore >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${clampedScore}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-gray-800">{Math.round(clampedScore)}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500">Quality Score</span>
    </div>
  );
}

export function CalibrationStatusCard({ calibrationStatus, modelQualityScore }: Props) {
  const config = STATUS_CONFIG[calibrationStatus];

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Model Calibration</h3>
      <div className="flex items-start gap-4">
        <QualityGauge score={modelQualityScore} />
        <div className="flex-1">
          <span
            className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${config.color} ${config.bg}`}
          >
            {config.label}
          </span>
          <p className="text-xs text-gray-500 mt-2">{config.description}</p>
        </div>
      </div>
    </div>
  );
}

export default CalibrationStatusCard;
