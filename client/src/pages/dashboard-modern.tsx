/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { PieChart as RechartsPieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import React, { useState } from 'react';
import { useFundContext } from "@/contexts/FundContext";
import { PremiumCard } from "@/components/ui/PremiumCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { POVBrandHeader } from "@/components/ui/POVLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PieChart,
  Filter,
  Download,
  Eye,
  Activity,
  Share2
} from "lucide-react";
import CashflowDashboard from "@/components/dashboard/CashflowDashboard";
import ShareConfigModal from "@/components/sharing/ShareConfigModal";
import type { CreateShareLinkRequest } from "@shared/sharing-schema";

export default function ModernDashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [timeframe, setTimeframe] = useState('12m');
  const [activeView, setActiveView] = useState('overview');

  // Mock function to create share links - replace with actual API call
  const handleCreateShare = async (config: CreateShareLinkRequest): Promise<{ shareUrl: string; shareId: string }> => {
    // Simulate API call
    const shareId = 'demo-share-123';
    const shareUrl = `${window.location.origin}/shared/${shareId}`;

    console.log('Creating share link:', config);

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { shareUrl, shareId };
  };

  if (isLoading || !currentFund) {
    return (
      <div className="min-h-screen bg-pov-gray">
        <POVBrandHeader 
          title="Dashboard"
          subtitle="Real-time fund performance and portfolio analytics"
          variant="light"
        />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_: any, i: any) => (
                <div key={i} className="h-32 bg-pov-white rounded-lg shadow-card"></div>
              ))}
            </div>
            <div className="h-96 bg-pov-white rounded-lg shadow-card"></div>
          </div>
        </div>
      </div>
    );
  }

  // Sample data - in real app this would come from API
  const fundMetrics = {
    totalCommitted: currentFund.size || 125000000,
    totalInvested: 85000000,
    totalValue: 240000000,
    irr: 28.5,
    moic: 2.82,
    dpi: 0.85,
    activeInvestments: 24,
    exitedInvestments: 8,
    deploymentRate: 68
  };

  const sectorData = [
    { name: 'FinTech', value: 35, color: '#292929' },
    { name: 'HealthTech', value: 28, color: '#E0D8D1' },
    { name: 'Enterprise SaaS', value: 22, color: '#10B981' },
    { name: 'Consumer', value: 15, color: '#F59E0B' }
  ];

  const performanceData = [
    { quarter: 'Q1 23', value: 125000000, growth: 0 },
    { quarter: 'Q2 23', value: 145000000, growth: 16 },
    { quarter: 'Q3 23', value: 178000000, growth: 23 },
    { quarter: 'Q4 23', value: 203000000, growth: 14 },
    { quarter: 'Q1 24', value: 240000000, growth: 18 }
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Dashboard"
        subtitle="Real-time fund performance and portfolio analytics"
        variant="light"
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Top Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center space-x-4">
            <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
              <TabsList className="bg-pov-white border border-pov-gray">
                <TabsTrigger value="overview" className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="performance" className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="cashflow" className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white">
                  <Activity className="h-4 w-4 mr-2" />
                  Cashflow
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center space-x-3">
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-32 bg-pov-white border-pov-gray">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">3 Months</SelectItem>
                <SelectItem value="6m">6 Months</SelectItem>
                <SelectItem value="12m">12 Months</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm" className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            
            <Button variant="outline" size="sm" className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            <ShareConfigModal
              fundId={String(currentFund.id || 'demo-fund')}
              fundName={currentFund.name || 'Demo Fund'}
              onCreateShare={handleCreateShare}
            >
              <Button variant="outline" size="sm" className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white">
                <Share2 className="h-4 w-4 mr-2" />
                Share with LPs
              </Button>
            </ShareConfigModal>
          </div>
        </div>

        <Tabs value={activeView} className="space-y-8">
          
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            
            {/* Key Metrics Cards - Press On Branded */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard
                label="Total Value"
                value={`$${(fundMetrics.totalValue / 1000000).toFixed(1)}M`}
                delta="+15.2%"
                intent="positive"
              />

              <KpiCard
                label="Net IRR"
                value={`${fundMetrics.irr.toFixed(1)}%`}
                delta="+2.1%"
                intent="positive"
              />

              <KpiCard
                label="MOIC"
                value={`${fundMetrics.moic.toFixed(2)}x`}
                delta="+0.3x"
                intent="positive"
              />

              <KpiCard
                label="DPI"
                value={`${fundMetrics.dpi.toFixed(2)}x`}
                delta="Realized returns"
                intent="neutral"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <KpiCard
                label="Deployed Capital"
                value={`$${(fundMetrics.totalInvested / 1000000).toFixed(1)}M`}
                delta={`${fundMetrics.deploymentRate}% of committed`}
                intent="neutral"
              />

              <KpiCard
                label="Active Companies"
                value={`${fundMetrics.activeInvestments}`}
                delta={`${fundMetrics.exitedInvestments} exited`}
                intent="neutral"
              />

              <KpiCard
                label="TVPI"
                value={`${((fundMetrics.totalValue / fundMetrics.totalInvested)).toFixed(2)}x`}
                delta="Total value to paid-in"
                intent="positive"
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Portfolio Value Over Time */}
              <PremiumCard 
                title="Portfolio Value Trend"
                subtitle="12-month performance trajectory"
                className="lg:col-span-2"
                headerActions={
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                }
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E0D8D1" opacity={0.3} />
                      <XAxis dataKey="quarter" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} tickFormatter={(value: any) => `$${value/1000000}M`} />
                      <Tooltip 
                        formatter={(value: any) => [`$${(value/1000000).toFixed(1)}M`, 'Portfolio Value']}
                        labelStyle={{color: '#292929'}}
                        contentStyle={{
                          backgroundColor: '#FFFFFF', 
                          border: '1px solid #E0D8D1',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#292929" 
                        fill="url(#gradient)"
                        strokeWidth={3}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#292929" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#E0D8D1" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumCard>

              {/* Sector Allocation */}
              <PremiumCard 
                title="Sector Allocation"
                subtitle="Portfolio concentration by sector"
                headerActions={
                  <Button variant="ghost" size="sm">
                    <PieChart className="h-4 w-4" />
                  </Button>
                }
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={sectorData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {sectorData.map((entry: any, index: any) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [`${value}%`, 'Allocation']}
                        contentStyle={{
                          backgroundColor: '#FFFFFF', 
                          border: '1px solid #E0D8D1',
                          borderRadius: '8px'
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {sectorData.map((sector: any, index: any) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: sector.color }}
                      ></div>
                      <span className="font-poppins text-sm text-[#292929]">{sector.name}</span>
                      <span className="font-mono text-xs text-[#292929]/60">{sector.value}%</span>
                    </div>
                  ))}
                </div>
              </PremiumCard>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PremiumCard 
                title="DPI"
                className="text-center"
              >
                <div className="space-y-2">
                  <div className="font-inter font-bold text-4xl text-[#292929]">
                    {fundMetrics.dpi.toFixed(2)}x
                  </div>
                  <p className="font-poppins text-sm text-[#292929]/70">
                    Distributions to Paid-In
                  </p>
                  <Badge variant="outline" className="text-pov-success border-pov-success/20 bg-pov-success/5">
                    +12.5% QoQ
                  </Badge>
                </div>
              </PremiumCard>

              <PremiumCard
                title="TVPI"
                className="text-center"
              >
                <div className="space-y-2">
                  <div className="font-inter font-bold text-4xl text-[#292929]">
                    {fundMetrics.moic.toFixed(2)}x
                  </div>
                  <p className="font-poppins text-sm text-[#292929]/70">
                    Total Value to Paid-In
                  </p>
                  <Badge variant="outline" className="text-pov-success border-pov-success/20 bg-pov-success/5">
                    +8.3% QoQ
                  </Badge>
                </div>
              </PremiumCard>

              <PremiumCard
                title="Net IRR"
                className="text-center"
              >
                <div className="space-y-2">
                  <div className="font-inter font-bold text-4xl text-[#292929]">
                    {fundMetrics.irr}%
                  </div>
                  <p className="font-poppins text-sm text-[#292929]/70">
                    Internal Rate of Return
                  </p>
                  <Badge variant="outline" className="text-pov-success border-pov-success/20 bg-pov-success/5">
                    Top Quartile
                  </Badge>
                </div>
              </PremiumCard>
            </div>
          </TabsContent>

          {/* Cashflow Management Tab */}
          <TabsContent value="cashflow" className="space-y-8">
            <CashflowDashboard
              fundId={String(currentFund?.id || 'default')}
              className="max-w-none"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

