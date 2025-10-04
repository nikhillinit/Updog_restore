/**
 * KPI Dashboard Example Component
 *
 * Example implementation showing how to integrate the KPI selector system
 * into your application components.
 *
 * This is a reference implementation - copy and adapt for your needs.
 */

import { useFundKpis, useKpiAlerts } from '@/hooks/useFundKpis';
import { formatKPI } from '@/core/selectors/fund-kpis';

interface KpiDashboardProps {
  fundId: number;
}

/**
 * Basic KPI Dashboard
 */
export function KpiDashboard({ fundId }: KpiDashboardProps) {
  const { data: kpis, isLoading, error } = useFundKpis({ fundId });

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800">Failed to load KPIs: {error.message}</p>
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard
        label="Committed"
        value={formatKPI(kpis.committed, 'currency')}
        subtitle="Total fund size"
      />
      <MetricCard
        label="Called"
        value={formatKPI(kpis.called, 'currency')}
        subtitle={`${((kpis.called / kpis.committed) * 100).toFixed(1)}% of commitments`}
      />
      <MetricCard
        label="Invested"
        value={formatKPI(kpis.invested, 'currency')}
        subtitle={`${formatKPI(kpis.uncalled, 'currency')} dry powder`}
      />
      <MetricCard
        label="NAV"
        value={formatKPI(kpis.nav, 'currency')}
        subtitle="Current portfolio value"
      />
      <MetricCard
        label="TVPI"
        value={formatKPI(kpis.tvpi, 'multiple')}
        subtitle="Total value created"
        highlight={kpis.tvpi >= 2.0}
      />
      <MetricCard
        label="DPI"
        value={formatKPI(kpis.dpi, 'multiple')}
        subtitle="Cash returned to LPs"
        highlight={kpis.dpi >= 1.0}
      />
      <MetricCard
        label="IRR"
        value={formatKPI(kpis.irr, 'percentage')}
        subtitle="Annualized return"
        highlight={kpis.irr >= 0.20}
      />
      <MetricCard
        label="Distributions"
        value={formatKPI(kpis.called - kpis.invested, 'currency')}
        subtitle="Available for deployment"
      />
    </div>
  );
}

/**
 * KPI Card Component
 */
interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
}

function MetricCard({ label, value, subtitle, highlight }: MetricCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        highlight
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-gray-200'
      }`}
    >
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}

/**
 * KPI Dashboard with Alerts
 */
export function KpiDashboardWithAlerts({ fundId }: KpiDashboardProps) {
  const { data: alerts, isLoading } = useKpiAlerts(fundId, {
    minTVPI: 1.5,
    minDPI: 0.5,
    minIRR: 0.15,
    maxDeploymentRate: 0.8,
  });

  if (isLoading || !alerts) return <div>Loading...</div>;

  const { kpis, tvpiAlert, dpiAlert, irrAlert, deploymentAlert } = alerts;
  const hasAlerts = tvpiAlert || dpiAlert || irrAlert || deploymentAlert;

  return (
    <div className="space-y-4">
      {hasAlerts && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-semibold mb-2">Performance Alerts</h3>
          <ul className="space-y-1 text-sm">
            {tvpiAlert && (
              <li className="text-yellow-800">
                TVPI ({kpis.tvpi.toFixed(2)}x) is below target (1.50x)
              </li>
            )}
            {dpiAlert && (
              <li className="text-yellow-800">
                DPI ({kpis.dpi.toFixed(2)}x) is below target (0.50x)
              </li>
            )}
            {irrAlert && (
              <li className="text-yellow-800">
                IRR ({(kpis.irr * 100).toFixed(1)}%) is below target (15.0%)
              </li>
            )}
            {deploymentAlert && (
              <li className="text-yellow-800">
                Deployment rate (
                {((kpis.invested / kpis.committed) * 100).toFixed(1)}%) exceeds
                threshold (80%)
              </li>
            )}
          </ul>
        </div>
      )}

      <KpiDashboard fundId={fundId} />
    </div>
  );
}

/**
 * Historical KPI Comparison
 */
export function HistoricalKpiComparison({ fundId }: KpiDashboardProps) {
  const currentYear = new Date().getFullYear();
  const quarters = [
    `${currentYear - 1}-03-31`,
    `${currentYear - 1}-06-30`,
    `${currentYear - 1}-09-30`,
    `${currentYear - 1}-12-31`,
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Quarterly Performance</h3>
      <div className="grid grid-cols-4 gap-4">
        {quarters.map((quarter, idx) => (
          <QuarterCard key={quarter} fundId={fundId} quarter={quarter} />
        ))}
      </div>
    </div>
  );
}

function QuarterCard({ fundId, quarter }: { fundId: number; quarter: string }) {
  const { data: kpis, isLoading } = useFundKpis({ fundId, asOf: quarter });

  if (isLoading) {
    return <div className="h-32 bg-gray-100 rounded animate-pulse" />;
  }

  if (!kpis) return null;

  const quarterLabel = new Date(quarter).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="p-4 bg-white border border-gray-200 rounded">
      <div className="text-sm font-medium mb-2">{quarterLabel}</div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">TVPI:</span>
          <span className="font-medium">{kpis.tvpi.toFixed(2)}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">DPI:</span>
          <span className="font-medium">{kpis.dpi.toFixed(2)}x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">IRR:</span>
          <span className="font-medium">{(kpis.irr * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
