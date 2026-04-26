import { AlertTriangle, LineChart, Target, Wallet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MetricsCard } from '@/components/metrics/MetricsCard';
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

  return (
    <section aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#292929]">{title}</h2>
        <p className="text-sm text-[#292929]/70">{subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricsCard
          title="Deployment vs Plan"
          description="Actual deployed capital against age-adjusted plan."
          actual={data.actual.totalDeployed}
          target={data.variance.deploymentVariance.target}
          format="currency"
          status={data.variance.deploymentVariance.status}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricsCard
          title="TVPI vs Target"
          description="Actual multiple versus configured target multiple."
          actual={data.actual.tvpi}
          target={data.target.targetTVPI}
          format="multiple"
          icon={<LineChart className="h-4 w-4" />}
        />
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
      </div>
    </section>
  );
}
