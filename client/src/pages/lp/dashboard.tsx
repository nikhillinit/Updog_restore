/**
 * LP Dashboard Page
 *
 * Main landing page for Limited Partners showing portfolio summary,
 * fund performance, capital calls, distributions, documents, and notifications.
 *
 * Enhanced in Sprint 3 with:
 * - Capital calls widget with pending/due/overdue tracking
 * - Distributions widget with YTD summary
 * - Documents widget with recent documents
 * - Notifications widget with real-time updates
 *
 * @module client/pages/lp/dashboard
 */

import { useLPContext } from '@/contexts/LPContext';
import { useLPSummary } from '@/hooks/useLPSummary';
import { useLPUnreadCount } from '@/hooks/useLPNotifications';
import DashboardSummary from '@/components/lp/DashboardSummary';
import CapitalCallsWidget from '@/components/lp/CapitalCallsWidget';
import DistributionsWidget from '@/components/lp/DistributionsWidget';
import DocumentsWidget from '@/components/lp/DocumentsWidget';
import NotificationsWidget from '@/components/lp/NotificationsWidget';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Building2,
  Calendar,
  ExternalLink,
  DollarSign,
  Banknote,
  FileText,
  Bell,
  Settings,
} from 'lucide-react';
import { useLocation } from 'wouter';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPDashboard() {
  const {
    lpProfile,
    selectedFundId,
    setSelectedFundId,
    isLoading: profileLoading,
  } = useLPContext();
  const { data: summaryData, isLoading: summaryLoading } = useLPSummary();
  const { data: unreadData } = useLPUnreadCount();
  const [, navigate] = useLocation();

  const isLoading = profileLoading || summaryLoading;
  const unreadCount = unreadData?.unreadCount ?? 0;

  if (isLoading && !summaryData) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-inter text-[#292929]">
            {lpProfile?.name || 'LP Dashboard'}
          </h1>
          <p className="text-[#292929]/70 font-poppins mt-1">
            Portfolio overview and performance metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Notifications Badge */}
          <Button
            variant="outline"
            size="icon"
            className="relative"
            onClick={() => navigate('/lp/notifications')}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* Settings */}
          <Button variant="outline" size="icon" onClick={() => navigate('/lp/settings')}>
            <Settings className="h-5 w-5" />
          </Button>

          {/* Fund Filter */}
          {lpProfile && lpProfile.commitments.length > 1 && (
            <Select
              value={selectedFundId?.toString() || 'all'}
              onValueChange={(v) => setSelectedFundId(v === 'all' ? null : parseInt(v))}
            >
              <SelectTrigger className="w-[250px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Funds</SelectItem>
                {lpProfile.commitments.map((c) => (
                  <SelectItem key={c.fundId} value={c.fundId.toString()}>
                    {c.fundName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary Metrics */}
      {summaryData && (
        <DashboardSummary metrics={summaryData.aggregateMetrics} isLoading={isLoading} />
      )}

      {/* Sprint 3: Activity Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CapitalCallsWidget />
        <DistributionsWidget />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DocumentsWidget />
        <NotificationsWidget />
      </div>

      {/* Fund Summaries */}
      {summaryData && summaryData.fundSummaries.length > 0 && (
        <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-inter text-[#292929]">
              <Building2 className="h-5 w-5 text-blue-600" />
              Fund Performance
            </CardTitle>
            <CardDescription className="font-poppins text-[#292929]/70">
              Individual fund metrics and returns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summaryData.fundSummaries.map((fund) => (
                <div
                  key={fund.fundId}
                  className="border border-[#E0D8D1] rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/lp/fund-detail/${fund.fundId}`)}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    {/* Fund Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-inter font-bold text-lg text-[#292929]">
                          {fund.fundName}
                        </h3>
                        <Badge variant="outline">{fund.vintageYear}</Badge>
                        <ExternalLink className="h-4 w-4 text-[#292929]/50" />
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm font-poppins text-[#292929]/70">
                        <span>Commitment: {formatCurrency(fund.commitment)}</span>
                        <span>Called: {formatCurrency(fund.called)}</span>
                        <span>Distributed: {formatCurrency(fund.distributed)}</span>
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-xs font-poppins text-[#292929]/50">IRR</div>
                        <div
                          className={`text-lg font-bold font-inter ${fund.irr >= 0 ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {formatPercent(fund.irr)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-poppins text-[#292929]/50">TVPI</div>
                        <div className="text-lg font-bold font-inter text-[#292929]">
                          {fund.tvpi.toFixed(2)}x
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-poppins text-[#292929]/50">DPI</div>
                        <div className="text-lg font-bold font-inter text-[#292929]">
                          {fund.dpi.toFixed(2)}x
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-poppins text-[#292929]/50">NAV</div>
                        <div className="text-lg font-bold font-inter text-[#292929]">
                          {formatCurrency(fund.nav)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Last Updated */}
                  <div className="flex items-center gap-2 mt-3 text-xs text-[#292929]/50 font-poppins">
                    <Calendar className="h-3 w-3" />
                    <span>Last updated: {new Date(fund.lastUpdated).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions - Enhanced for Sprint 3 */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <CardTitle className="font-inter text-[#292929]">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/capital-calls')}
            >
              <DollarSign className="h-6 w-6 text-blue-600" />
              <span className="font-poppins text-sm">Capital Calls</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/distributions')}
            >
              <Banknote className="h-6 w-6 text-green-600" />
              <span className="font-poppins text-sm">Distributions</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/documents')}
            >
              <FileText className="h-6 w-6 text-indigo-600" />
              <span className="font-poppins text-sm">Documents</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/capital-account')}
            >
              <TrendingUp className="h-6 w-6 text-orange-600" />
              <span className="font-poppins text-sm">Capital Account</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/performance')}
            >
              <TrendingUp className="h-6 w-6 text-purple-600" />
              <span className="font-poppins text-sm">Performance</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/lp/reports')}
            >
              <Building2 className="h-6 w-6 text-amber-600" />
              <span className="font-poppins text-sm">Reports</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
