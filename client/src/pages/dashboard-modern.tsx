import React, { useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Download, Activity, Share2 } from 'lucide-react';
import CashflowDashboard from '@/components/dashboard/CashflowDashboard';
import { TargetMetricsSnapshot } from '@/components/metrics/TargetMetricsSnapshot';
import ShareConfigModal from '@/components/sharing/ShareConfigModal';
import type { CreateShareLinkRequest } from '@shared/sharing-schema';

export default function ModernDashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [timeframe, setTimeframe] = useState('12m');
  const [activeView, setActiveView] = useState('overview');

  // Mock function to create share links - replace with actual API call
  const handleCreateShare = async (
    config: CreateShareLinkRequest
  ): Promise<{ shareUrl: string; shareId: string }> => {
    void config;

    // Simulate API call
    const shareId = 'demo-share-123';
    const shareUrl = `${window.location.origin}/shared/${shareId}`;

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

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
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-32 bg-pov-white rounded-lg shadow-card"></div>
              ))}
            </div>
            <div className="h-96 bg-pov-white rounded-lg shadow-card"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Dashboard"
        subtitle="Fund workspace and truthful live surfaces"
        variant="light"
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <TargetMetricsSnapshot
          title="Target-Aware Snapshot"
          subtitle="Truthful live metrics sourced from the unified metrics layer."
        />

        {/* Top Controls */}
        <div className="mt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="flex items-center space-x-4">
            <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
              <TabsList className="bg-pov-white border border-pov-gray">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="performance"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
                  Performance
                </TabsTrigger>
                <TabsTrigger
                  value="cashflow"
                  className="data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white"
                >
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

            <Button
              variant="outline"
              size="sm"
              className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            <ShareConfigModal
              fundId={String(currentFund.id || 'demo-fund')}
              fundName={currentFund.name || 'Demo Fund'}
              onCreateShare={handleCreateShare}
            >
              <Button
                variant="outline"
                size="sm"
                className="border-pov-gray hover:bg-pov-charcoal hover:text-pov-white"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share with LPs
              </Button>
            </ShareConfigModal>
          </div>
        </div>

        <Tabs value={activeView} className="space-y-8">
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            <PremiumCard
              title="Overview remains deferred"
              subtitle="Dashboard overview cards and charts require authoritative portfolio analytics inputs"
            >
              <div className="space-y-4 text-sm text-[#292929]/75">
                <p>
                  This dashboard no longer presents hardcoded portfolio value, IRR, MOIC, or
                  sector-allocation visuals as live data.
                </p>
                <p>
                  Use the live forecasting surface for deterministic fund data and the model results
                  surface for publish-backed comparison until dashboard analytics are wired to
                  trustworthy backend inputs.
                </p>
              </div>
            </PremiumCard>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-8">
            <PremiumCard
              title="Performance analytics remain deferred"
              subtitle="Benchmark and attribution panels are hidden until they can be backed by real portfolio analytics"
            >
              <div className="space-y-4 text-sm text-[#292929]/75">
                <p>
                  Benchmark, DPI/TVPI, and attribution panels stay hidden until they can be backed
                  by authoritative portfolio analytics inputs rather than static sample values.
                </p>
                <p>
                  This keeps the live dashboard from implying benchmarked performance claims that
                  the current backend does not yet support truthfully.
                </p>
              </div>
            </PremiumCard>
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
