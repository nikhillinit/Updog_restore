import type { ReactNode } from 'react';
import { AlertTriangle, LineChart, Target, Wallet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MetricsCard } from '@/components/metrics/MetricsCard';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { useFundMetrics } from '@/hooks/useFundMetrics';

interface TargetMetricsSnapshotProps {
  title: string;
  subtitle: string;
}

function getPortfolioConstructionStatus(actual: number, target: number) {
  if (target <= 0) {
    return 'on-track';
  }

  return actual / target >= 0.9 ? 'on-track' : 'behind';
}

function formatSnapshotValue(value: number, format: 'currency' | 'multiple' | 'number') {
  switch (format) {
    case 'currency':
      if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'multiple':
      return `${value.toFixed(2)}x`;
    case 'number':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
  }
}

function PendingMetricsCard({
  title,
  description,
  actual,
  target,
  format,
  badgeLabel,
  icon,
}: {
  title: string;
  description: string;
  actual: number;
  target: number;
  format: 'currency' | 'multiple' | 'number';
  badgeLabel: string;
  icon: ReactNode;
}) {
  return (
    <PremiumCard>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-pov-charcoal/10 p-2">{icon}</div>
          <div>
            <h3 className="font-poppins text-sm text-gray-600">{title}</h3>
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <p className="font-inter text-3xl font-bold text-pov-charcoal">
          {formatSnapshotValue(actual, format)}
        </p>
        <Badge variant="outline" className="text-xs">
          Actual
        </Badge>
      </div>

      <p className="text-sm text-gray-600">
        <span className="font-medium">Target:</span> {formatSnapshotValue(target, format)}
      </p>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
          {badgeLabel}
        </Badge>
      </div>
    </PremiumCard>
  );
}

export function TargetMetricsSnapshot({ title, subtitle }: TargetMetricsSnapshotProps) {
  const { data, isLoading, error } = useFundMetrics({ skipProjections: true });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-40 animate-pulse rounded-lg bg-white shadow-card" />
        <div className="h-40 animate-pulse rounded-lg bg-white shadow-card" />
        <div className="h-40 animate-pulse rounded-lg bg-white shadow-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error?.message || 'Target-aware metrics are temporarily unavailable.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data.target || !data.variance?.deploymentVariance) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Baseline pending: target-aware metrics require a published target snapshot before plan
          comparisons can be shown.
        </AlertDescription>
      </Alert>
    );
  }

  const deploymentPending = data.actual.totalDeployed <= 0;
  const paidInCapitalPending = data.actual.totalCalled === 0;
  const companiesPending = data.actual.totalCompanies <= 0;

  return (
    <section aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#292929]">{title}</h2>
        <p className="text-sm text-[#292929]/70">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {deploymentPending ? (
          <PendingMetricsCard
            title="Deployment vs Plan"
            description="Plan comparison starts after the first deployment is recorded."
            actual={data.actual.totalDeployed}
            target={data.variance.deploymentVariance.target}
            format="currency"
            badgeLabel="Awaiting deployment"
            icon={<Wallet className="h-4 w-4" />}
          />
        ) : (
          <MetricsCard
            title="Deployment vs Plan"
            description="Actual deployed capital against age-adjusted plan."
            actual={data.actual.totalDeployed}
            target={data.variance.deploymentVariance.target}
            format="currency"
            status={data.variance.deploymentVariance.status}
            icon={<Wallet className="h-4 w-4" />}
          />
        )}
        {paidInCapitalPending ? (
          <PendingMetricsCard
            title="TVPI vs Target"
            description="Multiple comparison starts after paid-in capital is recorded."
            actual={data.actual.tvpi}
            target={data.target.targetTVPI}
            format="multiple"
            badgeLabel="Awaiting paid-in capital"
            icon={<LineChart className="h-4 w-4" />}
          />
        ) : (
          <MetricsCard
            title="TVPI vs Target"
            description="Actual multiple versus configured target multiple."
            actual={data.actual.tvpi}
            target={data.target.targetTVPI}
            format="multiple"
            icon={<LineChart className="h-4 w-4" />}
          />
        )}
        {companiesPending ? (
          <PendingMetricsCard
            title="Companies vs Target"
            description="Construction comparison starts after the first company is added."
            actual={data.actual.totalCompanies}
            target={data.target.targetCompanyCount}
            format="number"
            badgeLabel="Awaiting companies"
            icon={<Target className="h-4 w-4" />}
          />
        ) : (
          <MetricsCard
            title="Companies vs Target"
            description="Current company count against construction target."
            actual={data.actual.totalCompanies}
            target={data.target.targetCompanyCount}
            format="number"
            status={getPortfolioConstructionStatus(
              data.actual.totalCompanies,
              data.target.targetCompanyCount
            )}
            icon={<Target className="h-4 w-4" />}
          />
        )}
      </div>
    </section>
  );
}
