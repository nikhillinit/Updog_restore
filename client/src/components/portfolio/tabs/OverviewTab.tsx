import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { PortfolioCompany } from '@shared/schema';
import { KpiCard } from '@/components/ui/KpiCard';
import { SwipeableMetricCards } from '@/components/ui/SwipeableMetricCards';
import type { MetricCardData } from '@/components/ui/SwipeableMetricCards';
import { DataTable } from '@/components/ui/DataTable';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AddCompanyDialog } from './AddCompanyDialog';
import { useFundContext } from '@/contexts/FundContext';
import { usePortfolioCompanies } from '@/hooks/use-fund-data';
import {
  Search,
  Plus,
  Download,
  Building2,
  DollarSign,
  Target,
  BarChart3,
  Eye,
  Rocket,
  Calendar,
  History,
  RotateCcw,
} from 'lucide-react';

type PortfolioRow = {
  id: number;
  company: string;
  sector: string;
  stage: string;
  invested: number;
  currentValue: number;
  moic: number;
  status: string;
};

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
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }

  return `$${amount.toLocaleString()}`;
}

function formatMonthLabel(value: string | null): string {
  if (!value) return 'historical mode';

  const normalized = /^\d{4}-\d{2}$/.test(value) ? `${value}-01T00:00:00Z` : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isExitedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'exited' || normalized === 'closed' || normalized === 'liquidated';
}

function buildPortfolioRow(company: PortfolioCompany): PortfolioRow {
  const invested = toNumber(company.investmentAmount);
  const currentValue = toNumber(company.currentValuation);
  const moic = invested > 0 ? currentValue / invested : 0;

  return {
    id: company.id,
    company: company.name,
    sector: company.sector,
    stage: company.currentStage ?? company.stage,
    invested,
    currentValue,
    moic,
    status: company.status,
  };
}

function EmptyState({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 bg-presson-highlight rounded-full mb-6">
        <Rocket className="h-8 w-8 text-presson-text" />
      </div>
      <h3 className="text-xl font-bold text-presson-text mb-2">No Portfolio Companies Yet</h3>
      <p className="text-presson-textMuted mb-6 max-w-md">
        Start building your portfolio by adding your first investment. Track performance and
        historical snapshots in one place.
      </p>
      <Button
        onClick={onGetStarted}
        className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add First Company
      </Button>
    </div>
  );
}

function PortfolioCard({ company, onView }: { company: PortfolioRow; onView: () => void }) {
  return (
    <div className="bg-white border border-presson-borderSubtle rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h4 className="font-bold text-presson-text">{company.company}</h4>
          <p className="text-sm text-presson-textMuted">
            {company.stage} • {company.sector}
          </p>
        </div>
        <Badge variant="outline" className="border-presson-borderSubtle text-presson-textMuted">
          {company.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-presson-borderSubtle">
        <div>
          <p className="text-xs text-presson-textMuted">Invested</p>
          <p className="font-mono font-bold tabular-nums">{formatCurrency(company.invested)}</p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">Current Value</p>
          <p className="font-mono font-bold tabular-nums">{formatCurrency(company.currentValue)}</p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">MOIC</p>
          <p className="font-mono font-bold tabular-nums">{company.moic.toFixed(2)}x</p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">Sector</p>
          <p className="font-medium text-presson-text">{company.sector}</p>
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full mt-2" onClick={onView}>
        <Eye className="h-4 w-4 mr-2" />
        View Details
      </Button>
    </div>
  );
}

export function OverviewTab() {
  const { fundId } = useFundContext();
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const activeAsOf = searchParams.get('asOf');

  const [showAddCompanyDialog, setShowAddCompanyDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSector, setFilterSector] = useState('all');

  const { portfolioCompanies, meta, isLoading } = usePortfolioCompanies(fundId || undefined, {
    ...(activeAsOf ? { asOf: activeAsOf } : {}),
  });

  const companyRows = useMemo(
    () => portfolioCompanies.map((company) => buildPortfolioRow(company)),
    [portfolioCompanies]
  );

  const filteredCompanies = useMemo(() => {
    return companyRows.filter((company) => {
      const matchesSearch =
        company.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        company.sector.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || company.status === filterStatus;
      const matchesSector = filterSector === 'all' || company.sector === filterSector;

      return matchesSearch && matchesStatus && matchesSector;
    });
  }, [companyRows, filterSector, filterStatus, searchTerm]);

  const portfolioMetrics = useMemo(() => {
    const activeCompanies = companyRows.filter((company) => !isExitedStatus(company.status));
    const totalInvested = companyRows.reduce((sum, company) => sum + company.invested, 0);
    const totalValue = companyRows.reduce((sum, company) => sum + company.currentValue, 0);
    const averageMOIC =
      companyRows.length > 0
        ? companyRows.reduce((sum, company) => sum + company.moic, 0) / companyRows.length
        : 0;
    const returnPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;

    return {
      totalCompanies: companyRows.length,
      activeCompanies: activeCompanies.length,
      exitedCompanies: companyRows.filter((company) => isExitedStatus(company.status)).length,
      totalInvested,
      totalValue,
      averageMOIC,
      returnPct,
    };
  }, [companyRows]);

  const sectors = useMemo(
    () => ['all', ...new Set(companyRows.map((company) => company.sector).filter(Boolean))],
    [companyRows]
  );

  const statuses = useMemo(
    () => ['all', ...new Set(companyRows.map((company) => company.status).filter(Boolean))],
    [companyRows]
  );

  const isHistoricalMode = meta.mode === 'historical' && !!activeAsOf;
  const hasHistoricalData = isHistoricalMode && meta.historicalAvailable;
  const isHistoricalEmpty = isHistoricalMode && !meta.historicalAvailable;
  const historicalLabel = formatMonthLabel(meta.resolvedAsOf ?? activeAsOf);
  const monthInputValue = activeAsOf ? activeAsOf.slice(0, 7) : '';

  const mobileMetrics: MetricCardData[] = [
    {
      id: 'companies',
      title: 'Total Companies',
      value: String(portfolioMetrics.totalCompanies),
      subtitle: `${portfolioMetrics.activeCompanies} Active`,
      change: `${portfolioMetrics.exitedCompanies} Exited`,
      trend: 'stable',
      severity: 'neutral',
      icon: Building2,
    },
    {
      id: 'invested',
      title: 'Total Invested',
      value: formatCurrency(portfolioMetrics.totalInvested),
      subtitle: 'Capital deployed',
      change: '',
      trend: 'stable',
      severity: 'neutral',
      icon: DollarSign,
    },
    {
      id: 'value',
      title: isHistoricalMode ? 'Historical Value' : 'Current Value',
      value: formatCurrency(portfolioMetrics.totalValue),
      subtitle: isHistoricalMode ? `As of ${historicalLabel}` : 'Portfolio value',
      change: `${portfolioMetrics.returnPct >= 0 ? '+' : ''}${portfolioMetrics.returnPct.toFixed(1)}%`,
      trend: portfolioMetrics.returnPct > 0 ? 'up' : 'down',
      severity: portfolioMetrics.returnPct > 0 ? 'success' : 'warning',
      icon: Target,
    },
    {
      id: 'moic',
      title: 'Average MOIC',
      value: `${portfolioMetrics.averageMOIC.toFixed(2)}x`,
      subtitle: 'Multiple on invested capital',
      change: '',
      trend: portfolioMetrics.averageMOIC > 2 ? 'up' : 'stable',
      severity: portfolioMetrics.averageMOIC > 2 ? 'success' : 'neutral',
      icon: BarChart3,
    },
  ];

  const tableColumns = [
    { key: 'company' as const, label: 'Company' },
    { key: 'sector' as const, label: 'Sector' },
    { key: 'stage' as const, label: 'Stage' },
    { key: 'invested' as const, label: 'Invested', align: 'right' as const },
    {
      key: 'currentValue' as const,
      label: isHistoricalMode ? 'Historical Value' : 'Current Value',
      align: 'right' as const,
    },
    { key: 'moic' as const, label: 'MOIC', align: 'right' as const },
  ];

  const tableRows = filteredCompanies.map((company) => ({
    company: company.company,
    sector: company.sector,
    stage: company.stage,
    invested: formatCurrency(company.invested),
    currentValue: formatCurrency(company.currentValue),
    moic: `${company.moic.toFixed(2)}x`,
  }));

  const setAsOfValue = (nextAsOf: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'companies');

    if (nextAsOf) {
      nextParams.set('asOf', nextAsOf);
    } else {
      nextParams.delete('asOf');
    }

    const nextSearch = nextParams.toString();
    setLocation(`${location.split('?')[0]}${nextSearch ? `?${nextSearch}` : ''}`, {
      replace: true,
    });
  };

  const handleMonthChange = (monthValue: string) => {
    setAsOfValue(monthValue || null);
  };

  const handleResetToToday = () => {
    setAsOfValue(null);
  };

  const handleAddCompany = () => {
    if (isHistoricalMode) {
      return;
    }
    setShowAddCompanyDialog(true);
  };

  const handleViewCompany = (_id: number) => {
    // TODO: navigate to company detail
  };

  const renderHistoricalNotice = () => {
    if (!isHistoricalMode) {
      return null;
    }

    return (
      <PremiumCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-presson-highlight p-2">
              <History className="h-4 w-4 text-presson-text" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="border-presson-borderSubtle">
                  Historical mode
                </Badge>
                <span className="text-sm text-presson-textMuted">As of {historicalLabel}</span>
              </div>
              <p className="mt-2 text-sm text-presson-textMuted">
                {hasHistoricalData
                  ? 'You are viewing historical portfolio values on the mounted companies surface.'
                  : 'No compatible historical snapshot is available for that date yet. Reset to today to return to live values.'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetToToday}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to today
          </Button>
        </div>
      </PremiumCard>
    );
  };

  if (!fundId) {
    return (
      <PremiumCard>
        <div className="py-8 text-center text-presson-textMuted">
          Select a fund to view portfolio companies.
        </div>
      </PremiumCard>
    );
  }

  const isLiveEmpty = !isLoading && !isHistoricalMode && companyRows.length === 0;

  return (
    <div className="space-y-6">
      {renderHistoricalNotice()}

      <PremiumCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-presson-textMuted" />
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-presson-borderSubtle focus:ring-presson-highlight"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full md:w-40 border-presson-borderSubtle">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'all' ? 'All Statuses' : status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterSector} onValueChange={setFilterSector}>
                <SelectTrigger className="w-full md:w-40 border-presson-borderSubtle">
                  <SelectValue placeholder="Sector" />
                </SelectTrigger>
                <SelectContent>
                  {sectors.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector === 'all' ? 'All Sectors' : sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-presson-borderSubtle px-3 py-2 bg-white">
              <Calendar className="h-4 w-4 text-presson-textMuted" />
              <span className="text-sm font-medium text-presson-text">Time Machine</span>
              <Input
                type="month"
                value={monthInputValue}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="h-8 w-[9.5rem] border-none p-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {isHistoricalMode && (
              <Button variant="outline" size="sm" onClick={handleResetToToday}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to today
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-presson-borderSubtle hover:bg-presson-accent hover:text-presson-accentOn"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              size="sm"
              className="bg-presson-accent hover:bg-presson-accent/90 text-presson-accentOn"
              onClick={handleAddCompany}
              disabled={isHistoricalMode}
              data-testid="portfolio-add-company-button"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </div>
        </div>
      </PremiumCard>

      <AddCompanyDialog
        fundId={fundId}
        open={showAddCompanyDialog}
        onOpenChange={setShowAddCompanyDialog}
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 rounded-lg border border-presson-borderSubtle bg-white"
              />
            ))}
          </div>
          <div className="h-72 rounded-lg border border-presson-borderSubtle bg-white" />
        </div>
      ) : isLiveEmpty ? (
        <PremiumCard>
          <EmptyState onGetStarted={handleAddCompany} />
        </PremiumCard>
      ) : isHistoricalEmpty ? (
        <PremiumCard>
          <div className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-presson-highlight">
              <History className="h-5 w-5 text-presson-text" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-presson-text">No Historical Snapshot</h3>
              <p className="mt-2 text-sm text-presson-textMuted">
                {meta.emptyReason === 'unsupported_snapshot'
                  ? 'Historical snapshots exist, but they do not yet contain a compatible companies view for this surface.'
                  : `There is no historical portfolio snapshot available for ${historicalLabel}.`}
              </p>
            </div>
            <Button variant="outline" onClick={handleResetToToday}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to today
            </Button>
          </div>
        </PremiumCard>
      ) : (
        <>
          <div className="hidden md:grid md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Companies"
              value={String(portfolioMetrics.totalCompanies)}
              delta={`${portfolioMetrics.activeCompanies} Active, ${portfolioMetrics.exitedCompanies} Exited`}
              intent="neutral"
            />
            <KpiCard
              label="Total Invested"
              value={formatCurrency(portfolioMetrics.totalInvested)}
              delta={
                isHistoricalMode ? `As of ${historicalLabel}` : 'Capital deployed across portfolio'
              }
              intent="neutral"
            />
            <KpiCard
              label={isHistoricalMode ? 'Historical Value' : 'Current Value'}
              value={formatCurrency(portfolioMetrics.totalValue)}
              delta={`${portfolioMetrics.returnPct >= 0 ? '+' : ''}${portfolioMetrics.returnPct.toFixed(1)}%`}
              intent={portfolioMetrics.returnPct >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Average MOIC"
              value={`${portfolioMetrics.averageMOIC.toFixed(2)}x`}
              delta="Multiple on invested capital"
              intent={portfolioMetrics.averageMOIC > 2 ? 'positive' : 'neutral'}
            />
          </div>

          <div className="md:hidden">
            <SwipeableMetricCards
              metrics={mobileMetrics}
              showNavigation={true}
              showIndicators={true}
              cardsPerView={1}
            />
          </div>

          <div className="hidden md:block">
            <PremiumCard
              title="Portfolio Companies"
              subtitle={
                isHistoricalMode
                  ? `${filteredCompanies.length} companies as of ${historicalLabel}`
                  : `${filteredCompanies.length} companies`
              }
            >
              {filteredCompanies.length > 0 ? (
                <DataTable columns={tableColumns} rows={tableRows} />
              ) : (
                <div className="text-center py-8 text-presson-textMuted">
                  No companies match your filters
                </div>
              )}
            </PremiumCard>
          </div>

          <div className="md:hidden space-y-3">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-bold text-presson-text">Portfolio Companies</h3>
              <span className="text-sm text-presson-textMuted">
                {filteredCompanies.length} companies
              </span>
            </div>
            {filteredCompanies.length > 0 ? (
              filteredCompanies.map((company) => (
                <PortfolioCard
                  key={company.id}
                  company={company}
                  onView={() => handleViewCompany(company.id)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-presson-textMuted bg-white rounded-lg border border-presson-borderSubtle">
                No companies match your filters
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
