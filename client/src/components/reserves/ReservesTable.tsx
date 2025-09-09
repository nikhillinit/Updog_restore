import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Search,
  TrendingUp,
  Info
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ReservesOutput, Company } from '@shared/types/reserves-v11';

interface ReservesTableProps {
  output: ReservesOutput;
  companies: Company[];
  onExport?: () => void;
}

type SortField = 'rank' | 'name' | 'invested' | 'moic' | 'allocation' | 'percent';
type SortDirection = 'asc' | 'desc';

export default function ReservesTable({ output, companies, onExport }: ReservesTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Create company map for easy lookup
  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();
    companies.forEach(c => map.set(c.id, c));
    return map;
  }, [companies]);
  
  // Combine allocation data with company data
  const tableData = useMemo(() => {
    const { allocations, metadata } = output;
    const { exit_moic_ranking } = metadata;
    
    return allocations.map((allocation) => {
      const company = companyMap.get(allocation.company_id);
      const rank = exit_moic_ranking.indexOf(allocation.company_id) + 1;
      
      return {
        rank,
        id: allocation.company_id,
        name: company?.name || 'Unknown',
        invested_cents: company?.invested_cents || 0,
        exit_moic_bps: company?.exit_moic_bps || 0,
        stage: company?.stage,
        sector: company?.sector,
        allocation_cents: allocation.planned_cents,
        allocation_percent: company?.invested_cents 
          ? (allocation.planned_cents / company.invested_cents) * 100
          : 0,
        cap_cents: allocation.cap_cents,
        reason: allocation.reason,
        iteration: allocation.iteration
      };
    });
  }, [output, companyMap]);
  
  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = tableData;
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(row => 
        row.name.toLowerCase().includes(term) ||
        row.stage?.toLowerCase().includes(term) ||
        row.sector?.toLowerCase().includes(term)
      );
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case 'rank':
          aVal = a.rank;
          bVal = b.rank;
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'invested':
          aVal = a.invested_cents;
          bVal = b.invested_cents;
          break;
        case 'moic':
          aVal = a.exit_moic_bps;
          bVal = b.exit_moic_bps;
          break;
        case 'allocation':
          aVal = a.allocation_cents;
          bVal = b.allocation_cents;
          break;
        case 'percent':
          aVal = a.allocation_percent;
          bVal = b.allocation_percent;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [tableData, searchTerm, sortField, sortDirection]);
  
  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Format currency
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  };
  
  // Format percentage
  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };
  
  // Format MOIC
  const formatMoic = (bps: number) => {
    return `${(bps / 10000).toFixed(2)}x`;
  };
  
  // Get sort icon
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };
  
  return (
    <div className="space-y-4">
      {/* Header with summary stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Reserve Allocations
            </span>
            <div className="flex gap-2">
              {onExport && (
                <Button onClick={onExport} size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Available</p>
              <p className="text-lg font-semibold">
                {formatCurrency(output.metadata.total_available_cents)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Allocated</p>
              <p className="text-lg font-semibold">
                {formatCurrency(output.metadata.total_allocated_cents)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="text-lg font-semibold">
                {formatCurrency(output.remaining_cents)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Companies Funded</p>
              <p className="text-lg font-semibold">
                {output.metadata.companies_funded}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Utilization</p>
              <p className="text-lg font-semibold">
                {formatPercent(
                  (output.metadata.total_allocated_cents / output.metadata.total_available_cents) * 100
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search by company, stage, or sector..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('rank')}
                      className="h-auto p-0 font-medium"
                    >
                      Rank {getSortIcon('rank')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('name')}
                      className="h-auto p-0 font-medium"
                    >
                      Company {getSortIcon('name')}
                    </Button>
                  </TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('invested')}
                      className="h-auto p-0 font-medium"
                    >
                      Initial Investment {getSortIcon('invested')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('moic')}
                      className="h-auto p-0 font-medium"
                    >
                      Exit MOIC {getSortIcon('moic')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('allocation')}
                      className="h-auto p-0 font-medium"
                    >
                      Reserve Allocation {getSortIcon('allocation')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('percent')}
                      className="h-auto p-0 font-medium"
                    >
                      % of Initial {getSortIcon('percent')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">Pass</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedData.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={row.rank <= 3 ? 'default' : 'secondary'}>
                        #{row.rank}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      {row.stage && (
                        <Badge variant="outline">{row.stage}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.sector || '-'}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.invested_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="font-medium">
                              {formatMoic(row.exit_moic_bps)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Expected exit multiple
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(row.allocation_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={row.allocation_percent > 100 ? 'default' : 'secondary'}
                        className="font-mono"
                      >
                        {formatPercent(row.allocation_percent)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.iteration === 1 ? 'outline' : 'default'}>
                        {row.iteration}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                
                {processedData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'No companies match your search' : 'No allocations to display'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Conservation check indicator */}
      {output.metadata.conservation_check === false && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Conservation check warning: Small rounding differences detected in allocation totals
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}