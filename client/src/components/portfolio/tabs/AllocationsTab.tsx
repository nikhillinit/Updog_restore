/**
 * Allocations Tab Component
 * Displays allocation state for all companies in a fund
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, AlertCircle, RefreshCw } from 'lucide-react';
import { useLatestAllocations } from './hooks/useLatestAllocations';
import { EditAllocationDialog } from './EditAllocationDialog';
import { createAllocationsColumns } from './allocations-table-columns';
import { formatCents } from '@/lib/units';
import type { AllocationCompany } from './types';

export function AllocationsTab() {
  const { data, isLoading, error, refetch } = useLatestAllocations();
  const [selectedCompany, setSelectedCompany] = useState<AllocationCompany | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AllocationCompany;
    direction: 'asc' | 'desc';
  } | null>(null);

  const handleEdit = useCallback((company: AllocationCompany) => {
    setSelectedCompany(company);
    setIsEditDialogOpen(true);
  }, []);

  const columns = useMemo(() => createAllocationsColumns(handleEdit), [handleEdit]);

  const companies = data?.companies;

  // Extract unique sectors and statuses for filters
  const sectors = useMemo(() => {
    if (!companies) return [];
    return Array.from(new Set(companies.map((c) => c.sector))).sort();
  }, [companies]);

  const statuses = useMemo(() => {
    if (!companies) return [];
    return Array.from(new Set(companies.map((c) => c.status))).sort();
  }, [companies]);

  // Filter and sort data
  const filteredAndSortedCompanies = useMemo(() => {
    if (!companies) return [];

    let filtered = companies.filter((company) => {
      const matchesSearch = company.company_name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesSector = sectorFilter === 'all' || company.sector === sectorFilter;
      const matchesStatus = statusFilter === 'all' || company.status === statusFilter;

      return matchesSearch && matchesSector && matchesStatus;
    });

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        return 0;
      });
    }

    return filtered;
  }, [companies, searchQuery, sectorFilter, statusFilter, sortConfig]);

  const handleSort = (key: keyof AllocationCompany) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  // Create column objects with sorting handlers
  const enrichedColumns = columns.map((col) => ({
    ...col,
    column: {
      toggleSorting: (desc?: boolean) => {
        if (col.accessorKey) {
          handleSort(col.accessorKey);
        }
      },
    },
  }));

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load allocations'}
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Alert>
    );
  }

  // Empty state
  if (!companies || companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">No companies found</p>
            <p className="text-sm">
              There are no companies with allocation data for this fund.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Company Allocations</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage reserve allocations for {data.metadata.companies_count} companies
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Total Planned Reserves</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {formatCents(data.metadata.total_planned_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Total Deployed Reserves</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {formatCents(data.metadata.total_deployed_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Remaining to Deploy</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {formatCents(
                data.metadata.total_planned_cents - data.metadata.total_deployed_cents,
                { compact: true }
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Sectors</option>
          {sectors.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      {searchQuery || sectorFilter !== 'all' || statusFilter !== 'all' ? (
        <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {filteredAndSortedCompanies.length} of {companies.length} companies
            </Badge>
          {(searchQuery || sectorFilter !== 'all' || statusFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSectorFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : null}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {enrichedColumns.map((column) => (
                  <TableHead key={column.id}>
                    {typeof column.header === 'function'
                      ? column.header({ column: column.column })
                      : column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCompanies.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={enrichedColumns.length}
                    className="text-center py-8 text-gray-500"
                  >
                    No companies match your filters
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCompanies.map((company) => (
                  <TableRow key={company.company_id}>
                    {enrichedColumns.map((column) => (
                      <TableCell key={`${company.company_id}-${column.id}`}>
                        {column.cell
                          ? column.cell({ row: { original: company } })
                          : column.accessorKey
                          ? String(company[column.accessorKey])
                          : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditAllocationDialog
        company={selectedCompany}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </div>
  );
}
