/**
 * OverviewTab - Portfolio Overview Component (GP Modernization Epic B)
 *
 * Displays portfolio metrics and company list with responsive design:
 * - Desktop: KpiCard row + DataTable
 * - Mobile (<768px): SwipeableMetricCards + Card layout
 */

import React, { useState, useMemo } from 'react';
import { KpiCard } from "@/components/ui/KpiCard";
import { SwipeableMetricCards, MetricCardData } from "@/components/ui/SwipeableMetricCards";
import { DataTable } from "@/components/ui/DataTable";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { track } from "@/lib/telemetry";
import {
  Search,
  Plus,
  Download,
  TrendingUp,
  TrendingDown,
  Building2,
  DollarSign,
  Target,
  BarChart3,
  Eye,
  ExternalLink,
  MoreHorizontal,
  Rocket
} from "lucide-react";

interface Portfolio {
  id: string;
  company: string;
  sector: string;
  stage: string;
  investmentDate: string;
  initialInvestment: number;
  currentValue: number;
  ownershipPercent: number;
  moic: number;
  status: 'active' | 'exited' | 'written-off';
  lastFunding: string;
  lastFundingAmount: number;
}

// Hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Empty state component with CTA
function EmptyState({ onGetStarted }: { onGetStarted: () => void }) {
  const handleClick = () => {
    track('empty_state_cta_clicked', { surface: 'portfolio_overview' });
    onGetStarted();
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 bg-presson-highlight rounded-full mb-6">
        <Rocket className="h-8 w-8 text-presson-text" />
      </div>
      <h3 className="text-xl font-bold text-presson-text mb-2">
        No Portfolio Companies Yet
      </h3>
      <p className="text-presson-textMuted mb-6 max-w-md">
        Start building your portfolio by adding your first investment. Track performance, ownership, and returns in one place.
      </p>
      <Button
        onClick={handleClick}
        className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add First Company
      </Button>
    </div>
  );
}

// Mobile portfolio card component
function PortfolioCard({ company, onView }: { company: Portfolio; onView: () => void }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/10 text-success border-success/20';
      case 'exited': return 'bg-info/10 text-info border-info/20';
      case 'written-off': return 'bg-error/10 text-error border-error/20';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="bg-white border border-presson-borderSubtle rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-presson-text">{company.company}</h4>
          <p className="text-sm text-presson-textMuted">{company.stage} • {company.sector}</p>
        </div>
        <Badge className={getStatusColor(company.status)}>
          {company.status === 'active' ? 'Active' :
           company.status === 'exited' ? 'Exited' : 'Written Off'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-presson-borderSubtle">
        <div>
          <p className="text-xs text-presson-textMuted">Invested</p>
          <p className="font-mono font-bold tabular-nums">
            ${(company.initialInvestment / 1000000).toFixed(2)}M
          </p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">Ownership</p>
          <p className="font-mono font-bold tabular-nums">
            {company.ownershipPercent}%
          </p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">Current Value</p>
          <p className="font-mono font-bold tabular-nums">
            ${(company.currentValue / 1000000).toFixed(2)}M
          </p>
        </div>
        <div>
          <p className="text-xs text-presson-textMuted">MOIC</p>
          <p className="font-mono font-bold tabular-nums flex items-center gap-1">
            {company.moic > 0 ? `${company.moic.toFixed(1)}x` : '—'}
            {company.moic > 2 && <TrendingUp className="h-3 w-3 text-success" />}
            {company.moic > 0 && company.moic <= 1 && <TrendingDown className="h-3 w-3 text-error" />}
          </p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full mt-2"
        onClick={onView}
      >
        <Eye className="h-4 w-4 mr-2" />
        View Details
      </Button>
    </div>
  );
}

export function OverviewTab() {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSector, setFilterSector] = useState('all');

  // Sample portfolio data (will be replaced with real data from FundContext)
  const portfolioCompanies: Portfolio[] = [
    {
      id: '1',
      company: 'FinanceAI',
      sector: 'FinTech',
      stage: 'Series A',
      investmentDate: '2023-03-15',
      initialInvestment: 2000000,
      currentValue: 5600000,
      ownershipPercent: 8.5,
      moic: 2.8,
      status: 'active',
      lastFunding: 'Series B',
      lastFundingAmount: 15000000
    },
    {
      id: '2',
      company: 'HealthLink',
      sector: 'HealthTech',
      stage: 'Seed',
      investmentDate: '2022-11-08',
      initialInvestment: 1500000,
      currentValue: 4200000,
      ownershipPercent: 12.3,
      moic: 2.8,
      status: 'active',
      lastFunding: 'Series A',
      lastFundingAmount: 8000000
    },
    {
      id: '3',
      company: 'DataStream',
      sector: 'Enterprise SaaS',
      stage: 'Series B',
      investmentDate: '2023-01-22',
      initialInvestment: 3500000,
      currentValue: 8900000,
      ownershipPercent: 5.2,
      moic: 2.54,
      status: 'active',
      lastFunding: 'Series C',
      lastFundingAmount: 25000000
    },
    {
      id: '4',
      company: 'RetailBot',
      sector: 'Consumer',
      stage: 'Seed',
      investmentDate: '2022-06-12',
      initialInvestment: 1000000,
      currentValue: 0,
      ownershipPercent: 15.8,
      moic: 0,
      status: 'written-off',
      lastFunding: 'Seed',
      lastFundingAmount: 2500000
    },
    {
      id: '5',
      company: 'CryptoSecure',
      sector: 'FinTech',
      stage: 'Series A',
      investmentDate: '2021-09-03',
      initialInvestment: 2500000,
      currentValue: 12500000,
      ownershipPercent: 6.7,
      moic: 5.0,
      status: 'exited',
      lastFunding: 'Series B',
      lastFundingAmount: 20000000
    }
  ];

  const filteredCompanies = useMemo(() => {
    return portfolioCompanies.filter(company => {
      const matchesSearch = company.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           company.sector.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || company.status === filterStatus;
      const matchesSector = filterSector === 'all' || company.sector === filterSector;
      return matchesSearch && matchesStatus && matchesSector;
    });
  }, [searchTerm, filterStatus, filterSector]);

  const portfolioMetrics = useMemo(() => {
    const activeCompanies = portfolioCompanies.filter(c => c.status === 'active');
    const totalInvested = portfolioCompanies.reduce((sum, c) => sum + c.initialInvestment, 0);
    const totalValue = portfolioCompanies.reduce((sum, c) => sum + c.currentValue, 0);
    const nonWrittenOff = portfolioCompanies.filter(c => c.status !== 'written-off');
    const averageMOIC = nonWrittenOff.length > 0
      ? nonWrittenOff.reduce((sum, c) => sum + c.moic, 0) / nonWrittenOff.length
      : 0;
    const returnPct = totalInvested > 0
      ? ((totalValue - totalInvested) / totalInvested * 100)
      : 0;

    return {
      totalCompanies: portfolioCompanies.length,
      activeCompanies: activeCompanies.length,
      exitedCompanies: portfolioCompanies.filter(c => c.status === 'exited').length,
      totalInvested,
      totalValue,
      averageMOIC,
      returnPct
    };
  }, []);

  // Convert metrics for SwipeableMetricCards
  const mobileMetrics: MetricCardData[] = [
    {
      id: 'companies',
      title: 'Total Companies',
      value: String(portfolioMetrics.totalCompanies),
      subtitle: `${portfolioMetrics.activeCompanies} Active`,
      change: `${portfolioMetrics.exitedCompanies} Exited`,
      trend: 'stable',
      severity: 'neutral',
      icon: Building2
    },
    {
      id: 'invested',
      title: 'Total Invested',
      value: `$${(portfolioMetrics.totalInvested / 1000000).toFixed(1)}M`,
      subtitle: 'Capital deployed',
      change: '',
      trend: 'stable',
      severity: 'neutral',
      icon: DollarSign
    },
    {
      id: 'value',
      title: 'Current Value',
      value: `$${(portfolioMetrics.totalValue / 1000000).toFixed(1)}M`,
      subtitle: 'Portfolio value',
      change: `+${portfolioMetrics.returnPct.toFixed(1)}%`,
      trend: portfolioMetrics.returnPct > 0 ? 'up' : 'down',
      severity: portfolioMetrics.returnPct > 0 ? 'success' : 'warning',
      icon: Target
    },
    {
      id: 'moic',
      title: 'Average MOIC',
      value: `${portfolioMetrics.averageMOIC.toFixed(1)}x`,
      subtitle: 'Multiple on invested',
      change: '',
      trend: portfolioMetrics.averageMOIC > 2 ? 'up' : 'stable',
      severity: portfolioMetrics.averageMOIC > 2 ? 'success' : 'neutral',
      icon: BarChart3
    }
  ];

  // DataTable columns - core columns per strategy
  const tableColumns = [
    { key: 'company' as const, label: 'Company' },
    { key: 'status' as const, label: 'Status' },
    { key: 'invested' as const, label: 'Invested', align: 'right' as const },
    { key: 'ownership' as const, label: 'Ownership', align: 'right' as const }
  ];

  // Transform data for DataTable
  const tableRows = filteredCompanies.map(c => ({
    company: c.company,
    status: c.status === 'active' ? 'Active' : c.status === 'exited' ? 'Exited' : 'Written Off',
    invested: `$${(c.initialInvestment / 1000000).toFixed(2)}M`,
    ownership: `${c.ownershipPercent}%`
  }));

  const handleAddCompany = () => {
    // Navigate to add company flow
    console.log('Add company clicked');
  };

  const handleViewCompany = (id: string) => {
    // Navigate to company detail
    console.log('View company:', id);
  };

  const isEmpty = portfolioCompanies.length === 0;

  return (
    <div className="space-y-6">
      {/* KPI Section - Responsive */}
      {!isEmpty && (
        <>
          {/* Desktop: KpiCard row */}
          <div className="hidden md:grid md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Companies"
              value={String(portfolioMetrics.totalCompanies)}
              delta={`${portfolioMetrics.activeCompanies} Active, ${portfolioMetrics.exitedCompanies} Exited`}
              intent="neutral"
            />
            <KpiCard
              label="Total Invested"
              value={`$${(portfolioMetrics.totalInvested / 1000000).toFixed(1)}M`}
              delta="Capital deployed across portfolio"
              intent="neutral"
            />
            <KpiCard
              label="Current Value"
              value={`$${(portfolioMetrics.totalValue / 1000000).toFixed(1)}M`}
              delta={`+${portfolioMetrics.returnPct.toFixed(1)}%`}
              intent={portfolioMetrics.returnPct > 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Average MOIC"
              value={`${portfolioMetrics.averageMOIC.toFixed(1)}x`}
              delta="Multiple on invested capital"
              intent={portfolioMetrics.averageMOIC > 2 ? 'positive' : 'neutral'}
            />
          </div>

          {/* Mobile: SwipeableMetricCards */}
          <div className="md:hidden">
            <SwipeableMetricCards
              metrics={mobileMetrics}
              showNavigation={true}
              showIndicators={true}
              cardsPerView={1}
            />
          </div>
        </>
      )}

      {/* Controls and Filters */}
      {!isEmpty && (
        <PremiumCard>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1 w-full md:w-auto">
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
                  <SelectTrigger className="w-full md:w-32 border-presson-borderSubtle">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="exited">Exited</SelectItem>
                    <SelectItem value="written-off">Written Off</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterSector} onValueChange={setFilterSector}>
                  <SelectTrigger className="w-full md:w-40 border-presson-borderSubtle">
                    <SelectValue placeholder="Sector" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    <SelectItem value="FinTech">FinTech</SelectItem>
                    <SelectItem value="HealthTech">HealthTech</SelectItem>
                    <SelectItem value="Enterprise SaaS">Enterprise SaaS</SelectItem>
                    <SelectItem value="Consumer">Consumer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 md:flex-none border-presson-borderSubtle hover:bg-presson-accent hover:text-presson-accentOn"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                size="sm"
                className="flex-1 md:flex-none bg-presson-accent hover:bg-presson-accent/90 text-presson-accentOn"
                onClick={handleAddCompany}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </div>
          </div>
        </PremiumCard>
      )}

      {/* Portfolio List */}
      {isEmpty ? (
        <PremiumCard>
          <EmptyState onGetStarted={handleAddCompany} />
        </PremiumCard>
      ) : (
        <>
          {/* Desktop: DataTable */}
          <div className="hidden md:block">
            <PremiumCard
              title="Portfolio Companies"
              subtitle={`${filteredCompanies.length} companies`}
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

          {/* Mobile: Card layout */}
          <div className="md:hidden space-y-3">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-bold text-presson-text">
                Portfolio Companies
              </h3>
              <span className="text-sm text-presson-textMuted">
                {filteredCompanies.length} companies
              </span>
            </div>
            {filteredCompanies.length > 0 ? (
              filteredCompanies.map(company => (
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
