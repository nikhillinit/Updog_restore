/**
 * LP Capital Account Page
 *
 * Consolidated view of capital account transactions with filtering and sorting.
 *
 * @module client/pages/lp/capital-account
 */

import { useState } from 'react';
import { useLPContext } from '@/contexts/LPContext';
import { useLPCapitalAccount } from '@/hooks/useLPCapitalAccount';
import CapitalAccountTable from '@/components/lp/CapitalAccountTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Calendar, RefreshCw } from 'lucide-react';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPCapitalAccount() {
  const { lpProfile, selectedFundId, setSelectedFundId } = useLPContext();
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const {
    data: accountData,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useLPCapitalAccount({
    ...(selectedFundId ? { fundId: selectedFundId } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  });

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-inter text-[#292929]">Capital Account</h1>
          <p className="text-[#292929]/70 font-poppins mt-1">
            Transaction history and capital flows
          </p>
        </div>

        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <CardTitle className="font-inter text-lg text-[#292929]">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fund Filter */}
            {lpProfile && lpProfile.commitments.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="fund-select">Fund</Label>
                <Select
                  value={selectedFundId?.toString() || 'all'}
                  onValueChange={(v) => setSelectedFundId(v === 'all' ? null : parseInt(v))}
                >
                  <SelectTrigger id="fund-select">
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
              </div>
            )}

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#292929]/50" />
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#292929]/50" />
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {accountData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-inter text-[#292929]">
                {formatCurrency(accountData.summary.totalCalled)}
              </div>
              <div className="text-sm font-poppins text-[#292929]/70 mt-1">Total Called</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-inter text-[#292929]">
                {formatCurrency(accountData.summary.totalDistributed)}
              </div>
              <div className="text-sm font-poppins text-[#292929]/70 mt-1">Total Distributed</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-inter text-[#292929]">
                {formatCurrency(accountData.summary.currentNav)}
              </div>
              <div className="text-sm font-poppins text-[#292929]/70 mt-1">Current NAV</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-inter text-[#292929]">
                {accountData.summary.transactionCount}
              </div>
              <div className="text-sm font-poppins text-[#292929]/70 mt-1">Transactions</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      {accountData && (
        <CapitalAccountTable
          transactions={accountData.transactions}
          isLoading={isLoading}
          hasMore={hasNextPage}
          onLoadMore={fetchNextPage}
        />
      )}
    </div>
  );
}
