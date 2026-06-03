/**
 * DataQualityCard
 *
 * Shows baseline age, variance history count, staleness warnings.
 */

import type { DataQualityResult } from '@shared/types/backtesting';

interface Props {
  dataQuality: DataQualityResult;
}

const QUALITY_CONFIG: Record<
  DataQualityResult['overallQuality'],
  { label: string; color: string; bg: string }
> = {
  good: { label: 'Good', color: 'text-success-dark', bg: 'bg-success/10' },
  acceptable: { label: 'Acceptable', color: 'text-warning-dark', bg: 'bg-warning/10' },
  poor: { label: 'Poor', color: 'text-error-dark', bg: 'bg-error/10' },
};

export function DataQualityCard({ dataQuality }: Props) {
  const quality = QUALITY_CONFIG[dataQuality.overallQuality];

  return (
    <div className="rounded-lg border border-beige-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-charcoal-700">Data Quality</h3>
        <span
          className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${quality.color} ${quality.bg}`}
        >
          {quality.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-charcoal-500">Baseline</span>
          <p className="font-medium text-pov-charcoal">
            {dataQuality.hasBaseline
              ? dataQuality.baselineAgeInDays !== null
                ? `${dataQuality.baselineAgeInDays}d old`
                : 'Available'
              : 'Missing'}
          </p>
        </div>
        <div>
          <span className="text-charcoal-500">Variance History</span>
          <p className="font-medium text-pov-charcoal">
            {dataQuality.varianceHistoryCount} reports
          </p>
        </div>
        <div>
          <span className="text-charcoal-500">Snapshot</span>
          <p className="font-medium text-pov-charcoal">
            {dataQuality.snapshotAvailable ? 'Available' : 'None'}
          </p>
        </div>
        <div>
          <span className="text-charcoal-500">Freshness</span>
          <p
            className={`font-medium ${dataQuality.isStale ? 'text-warning' : 'text-pov-charcoal'}`}
          >
            {dataQuality.isStale ? 'Stale' : 'Fresh'}
          </p>
        </div>
      </div>

      {dataQuality.warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {dataQuality.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-warning">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default DataQualityCard;
