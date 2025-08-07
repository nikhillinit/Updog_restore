import React, { useState } from 'react';
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Filter, 
  Plus, 
  Download, 
  TrendingUp, 
  TrendingDown,
  ExternalLink,
  Calendar,
  DollarSign,
  Users,
  Building2,
  Target,
  Eye,
  MoreHorizontal
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

export default function ModernPortfolio() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSector, setFilterSector] = useState('all');
  const [activeView, setActiveView] = useState('overview');

  // Sample portfolio data
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

  const filteredCompanies = portfolioCompanies.filter(company => {
    const matchesSearch = company.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.sector.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || company.status === filterStatus;
    const matchesSector = filterSector === 'all' || company.sector === filterSector;
    
    return matchesSearch && matchesStatus && matchesSector;
  });

  const portfolioMetrics = {
    totalCompanies: portfolioCompanies.length,
    activeCompanies: portfolioCompanies.filter(c => c.status === 'active').length,
    exitedCompanies: portfolioCompanies.filter(c => c.status === 'exited').length,
    totalInvested: portfolioCompanies.reduce((sum, c) => sum + c.initialInvestment, 0),
    totalValue: portfolioCompanies.reduce((sum, c) => sum + c.currentValue, 0),
    averageMOIC: portfolioCompanies.filter(c => c.status !== 'written-off').reduce((sum, c) => sum + c.moic, 0) / 
                 portfolioCompanies.filter(c => c.status !== 'written-off').length
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-pov-success/10 text-pov-success border-pov-success/20">Active</Badge>;
      case 'exited':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Exited</Badge>;
      case 'written-off':
        return <Badge className="bg-pov-error/10 text-pov-error border-pov-error/20">Written Off</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getMOICIndicator = (moic: number) => {
    if (moic > 2) {
      return <TrendingUp className="h-4 w-4 text-pov-success" />;
    } else if (moic > 1) {
      return <TrendingUp className="h-4 w-4 text-yellow-500" />;
    } else {
      return <TrendingDown className="h-4 w-4 text-pov-error" />;
    }
  };

  return (
    <div className="min-h-screen bg-pov-gray">
      <POVBrandHeader 
        title="Portfolio"
        subtitle="Monitor and analyze your portfolio companies performance"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Portfolio Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <PremiumCard className="text-center">
            <div className="space-y-2">
              <div className="p-2 bg-pov-charcoal/10 rounded-lg w-fit mx-auto">
                <Building2 className="h-5 w-5 text-pov-charcoal" />
              </div>
              <div className="font-inter font-bold text-3xl text-pov-charcoal">
                {portfolioMetrics.totalCompanies}
              </div>
              <p className="font-poppins text-sm text-gray-600">Total Companies</p>
              <div className="flex justify-center space-x-4 text-xs">
                <span className="text-pov-success">{portfolioMetrics.activeCompanies} Active</span>
                <span className="text-blue-600">{portfolioMetrics.exitedCompanies} Exited</span>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard className="text-center">
            <div className="space-y-2">
              <div className="p-2 bg-pov-success/10 rounded-lg w-fit mx-auto">
                <DollarSign className="h-5 w-5 text-pov-success" />
              </div>
              <div className="font-inter font-bold text-3xl text-pov-charcoal">
                ${(portfolioMetrics.totalInvested / 1000000).toFixed(1)}M
              </div>
              <p className="font-poppins text-sm text-gray-600">Total Invested</p>
              <p className="font-mono text-xs text-gray-500">
                Capital deployed across portfolio
              </p>
            </div>
          </PremiumCard>

          <PremiumCard className="text-center">
            <div className="space-y-2">
              <div className="p-2 bg-pov-beige/50 rounded-lg w-fit mx-auto">
                <Target className="h-5 w-5 text-pov-charcoal" />
              </div>
              <div className="font-inter font-bold text-3xl text-pov-charcoal">
                ${(portfolioMetrics.totalValue / 1000000).toFixed(1)}M
              </div>
              <p className="font-poppins text-sm text-gray-600">Current Value</p>
              <Badge className="bg-pov-success/10 text-pov-success border-pov-success/20 text-xs">
                +{(((portfolioMetrics.totalValue - portfolioMetrics.totalInvested) / portfolioMetrics.totalInvested) * 100).toFixed(1)}%
              </Badge>
            </div>
          </PremiumCard>

          <PremiumCard className="text-center">
            <div className="space-y-2">
              <div className="p-2 bg-pov-charcoal/10 rounded-lg w-fit mx-auto">
                <TrendingUp className="h-5 w-5 text-pov-charcoal" />
              </div>
              <div className="font-inter font-bold text-3xl text-pov-charcoal">
                {portfolioMetrics.averageMOIC.toFixed(1)}x
              </div>
              <p className="font-poppins text-sm text-gray-600">Average MOIC</p>
              <p className="font-mono text-xs text-gray-500">
                Multiple on invested capital
              </p>
            </div>
          </PremiumCard>
        </div>

        {/* Controls and Filters */}
        <PremiumCard className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64 border-pov-gray focus:ring-pov-beige"
                />
              </div>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 border-pov-gray">
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
                <SelectTrigger className="w-40 border-pov-gray">
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

            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm" className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </div>
          </div>
        </PremiumCard>

        {/* Portfolio Table */}
        <PremiumCard 
          title="Portfolio Companies"
          subtitle={`${filteredCompanies.length} companies`}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-pov-gray/30">
                  <th className="text-left py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Company</th>
                  <th className="text-left py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Sector</th>
                  <th className="text-left py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Status</th>
                  <th className="text-right py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Investment</th>
                  <th className="text-right py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Current Value</th>
                  <th className="text-right py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">MOIC</th>
                  <th className="text-center py-4 px-2 font-inter font-semibold text-sm text-pov-charcoal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="border-b border-pov-gray/20 hover:bg-pov-beige/10 transition-colors">
                    <td className="py-4 px-2">
                      <div className="space-y-1">
                        <div className="font-poppins font-medium text-pov-charcoal">
                          {company.company}
                        </div>
                        <div className="font-poppins text-xs text-gray-500">
                          {company.stage} • {new Date(company.investmentDate).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <Badge variant="outline" className="font-poppins text-xs">
                        {company.sector}
                      </Badge>
                    </td>
                    <td className="py-4 px-2">
                      {getStatusBadge(company.status)}
                    </td>
                    <td className="py-4 px-2 text-right">
                      <div className="space-y-1">
                        <div className="font-mono font-medium text-pov-charcoal">
                          ${(company.initialInvestment / 1000000).toFixed(2)}M
                        </div>
                        <div className="font-poppins text-xs text-gray-500">
                          {company.ownershipPercent}% ownership
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2 text-right">
                      <div className="space-y-1">
                        <div className="font-mono font-medium text-pov-charcoal">
                          ${(company.currentValue / 1000000).toFixed(2)}M
                        </div>
                        <div className="font-poppins text-xs text-gray-500">
                          Current valuation
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {getMOICIndicator(company.moic)}
                        <span className="font-mono font-bold text-pov-charcoal">
                          {company.moic > 0 ? `${company.moic.toFixed(1)}x` : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
