/**
 * CapitalAccountTable Component
 *
 * Sortable, filterable transaction table for LP capital account.
 *
 * @module client/components/lp/CapitalAccountTable
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpDown, ArrowDown, ArrowUp, Download, Filter } from 'lucide-react';
import type { CapitalAccountTransaction, TransactionType } from '@shared/types/lp-api';

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs.toLocaleString()}`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getTransactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    capital_call: 'Capital Call',
    distribution: 'Distribution',
    recallable_distribution: 'Recallable Distribution',
    management_fee: 'Management Fee',
    organizational_expense: 'Org Expense',
    preferred_return: 'Preferred Return',
    carried_interest: 'Carried Interest',
    return_of_capital: 'Return of Capital',
    gain_distribution: 'Gain Distribution',
  };
  return labels[type] || type;
}

function getTransactionTypeVariant(type: TransactionType): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (type.includes('distribution')) return 'default';
  if (type.includes('call')) return 'destructive';
  if (type.includes('fee')) return 'outline';
  return 'secondary';
}

// ============================================================================
// COMPONENT
// ============================================================================

interface CapitalAccountTableProps {
  transactions: CapitalAccountTransaction[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

type SortField = 'transactionDate' | 'amount' | 'type';
type SortOrder = 'asc' | 'desc';

export default function CapitalAccountTable({
  transactions,
  isLoading,
  hasMore,
  onLoadMore,
}: CapitalAccountTableProps) {
  const [sortField, setSortField] = useState<SortField>('transactionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');

  // Sort and filter transactions
  const sortedTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply filter
    if (filterType !== 'all') {
      filtered = filtered.filter((t) => t.type === filterType);
    }

    // Apply sort
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'transactionDate':
          comparison = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [transactions, sortField, sortOrder, filterType]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  return (
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle className="font-inter text-[#292929]">Capital Account</CardTitle>
            <CardDescription className="font-poppins text-[#292929]/70">
              Transaction history and capital flows
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <Select value={filterType} onValueChange={(v) => setFilterType(v as TransactionType | 'all')}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="capital_call">Capital Calls</SelectItem>
                <SelectItem value="distribution">Distributions</SelectItem>
                <SelectItem value="management_fee">Management Fees</SelectItem>
                <SelectItem value="carried_interest">Carried Interest</SelectItem>
              </SelectContent>
            </Select>

            {/* Export */}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('transactionDate')}
                >
                  <div className="flex items-center">
                    Date
                    <SortIcon field="transactionDate" />
                  </div>
                </TableHead>
                <TableHead>Fund</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('type')}
                >
                  <div className="flex items-center">
                    Type
                    <SortIcon field="type" />
                  </div>
                </TableHead>
                <TableHead>Description</TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end">
                    Amount
                    <SortIcon field="amount" />
                  </div>
                </TableHead>
                <TableHead className="text-right">Cumulative Called</TableHead>
                <TableHead className="text-right">Cumulative Distributed</TableHead>
                <TableHead className="text-right">NAV</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sortedTransactions.map((txn) => (
                <TableRow key={txn.id} className="hover:bg-[#E0D8D1]/20">
                  <TableCell className="font-mono text-sm">
                    {formatDate(txn.transactionDate)}
                  </TableCell>
                  <TableCell className="font-poppins text-sm">{txn.fundName}</TableCell>
                  <TableCell>
                    <Badge variant={getTransactionTypeVariant(txn.type)}>
                      {getTransactionTypeLabel(txn.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-poppins text-sm text-[#292929]/70 max-w-xs truncate">
                    {txn.description}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${txn.amount < 0 ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {formatCurrency(txn.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(txn.cumulativeCalled)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(txn.cumulativeDistributed)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold">
                    {formatCurrency(txn.cumulativeNav)}
                  </TableCell>
                </TableRow>
              ))}

              {sortedTransactions.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-[#292929]/50">
                    No transactions found
                  </TableCell>
                </TableRow>
              )}

              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="animate-pulse">Loading transactions...</div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Load More */}
        {hasMore && !isLoading && (
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={onLoadMore}>
              Load More Transactions
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
