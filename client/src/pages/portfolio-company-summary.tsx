import { useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, Building2, Calendar, DollarSign, Target, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundContext } from '@/contexts/FundContext';
import { usePortfolioCompany } from '@/hooks/use-fund-data';
import { ApiError } from '@/lib/queryClient';

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return 'Unknown';

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function SummaryMessageCard({
  actionLabel = 'Back to Companies',
  message,
  onAction,
}: {
  actionLabel?: string;
  message: string;
  onAction: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-4">
        <p className="text-sm text-charcoal-600">{message}</p>
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PortfolioCompanySummaryPage() {
  const [, params] = useRoute('/portfolio/company/:id');
  const [, setLocation] = useLocation();
  const { fundId } = useFundContext();

  const companyId = useMemo(() => {
    const rawId = params?.id;
    if (!rawId) return undefined;

    const parsed = Number.parseInt(rawId, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [params?.id]);

  const { company, error, isLoading } = usePortfolioCompany(fundId ?? undefined, companyId);

  const detailMetrics = useMemo(() => {
    if (!company) {
      return null;
    }

    const invested = toNumber(company.investmentAmount);
    const currentValue = toNumber(company.currentValuation);
    const moic = invested > 0 ? currentValue / invested : 0;

    return {
      invested,
      currentValue,
      moic,
    };
  }, [company]);

  const backToCompanies = () => {
    setLocation('/portfolio');
  };

  if (!fundId) {
    return (
      <div className="min-h-screen bg-pov-gray p-6">
        <SummaryMessageCard
          message="Select a fund to view company details."
          onAction={backToCompanies}
        />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="min-h-screen bg-pov-gray p-6">
        <SummaryMessageCard
          message="The requested company detail route is invalid."
          onAction={backToCompanies}
        />
      </div>
    );
  }

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="min-h-screen bg-pov-gray">
      <div
        className="max-w-5xl mx-auto px-6 py-8 space-y-6"
        data-testid="portfolio-company-summary-page"
      >
        <div>
          <Button variant="ghost" size="sm" className="gap-2" onClick={backToCompanies}>
            <ArrowLeft className="h-4 w-4" />
            Back to Companies
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-charcoal-600">
              Loading company summary...
            </CardContent>
          </Card>
        ) : notFound ? (
          <SummaryMessageCard
            actionLabel="Return to the portfolio Companies surface"
            message="The requested company could not be found in the selected fund."
            onAction={backToCompanies}
          />
        ) : error ? (
          <SummaryMessageCard
            actionLabel="Return to the portfolio Companies surface"
            message="Company details are temporarily unavailable. Please try again."
            onAction={backToCompanies}
          />
        ) : company && detailMetrics ? (
          <>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-beige-200 p-3">
                        <Building2 className="h-5 w-5 text-charcoal-700" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-semibold text-pov-charcoal">{company.name}</h1>
                        <p className="text-sm text-charcoal-600">
                          {company.currentStage ?? company.stage} · {company.sector}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-charcoal-600 max-w-2xl">
                      {company.description?.trim() ||
                        'Summary-only company detail is available on the live portfolio surface. Additional workflows remain intentionally unavailable until they are backed by live contracts.'}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {company.status}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-charcoal-600">
                        <DollarSign className="h-4 w-4" />
                        Invested
                      </div>
                      <div className="text-xl font-semibold text-pov-charcoal">
                        {formatCurrency(detailMetrics.invested)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-charcoal-600">
                        <Target className="h-4 w-4" />
                        Current value
                      </div>
                      <div className="text-xl font-semibold text-pov-charcoal">
                        {formatCurrency(detailMetrics.currentValue)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-charcoal-600">
                        <TrendingUp className="h-4 w-4" />
                        MOIC
                      </div>
                      <div className="text-xl font-semibold text-pov-charcoal">
                        {detailMetrics.moic.toFixed(2)}x
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Company Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Stage</span>
                    <span className="font-medium text-pov-charcoal">
                      {company.currentStage ?? company.stage}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Sector</span>
                    <span className="font-medium text-pov-charcoal">{company.sector}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Status</span>
                    <span className="font-medium text-pov-charcoal">{company.status}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Founded</span>
                    <span className="font-medium text-pov-charcoal">
                      {company.foundedYear ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Fund</span>
                    <span className="font-medium text-pov-charcoal">
                      Fund {company.fundId ?? fundId}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Investment Detail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-2 text-charcoal-600">
                      <Calendar className="h-4 w-4" />
                      Investment date
                    </span>
                    <span className="font-medium text-pov-charcoal">
                      {formatDate(company.investmentDate)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Ownership</span>
                    <span className="font-medium text-pov-charcoal">
                      {company.ownershipCurrentPct
                        ? `${Number.parseFloat(company.ownershipCurrentPct).toFixed(2)}%`
                        : 'Not captured'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-charcoal-600">Deal tags</span>
                    <span className="font-medium text-pov-charcoal text-right">
                      {company.dealTags?.length ? company.dealTags.join(', ') : 'None'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-pov-gray p-4 text-charcoal-700">
                    This route intentionally stays summary-only. Cap table, rounds, performance,
                    documents, edit, and scenario workflows remain outside the live portfolio path
                    until each has a backed contract.
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
