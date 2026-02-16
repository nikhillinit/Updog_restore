/**
 * Pipeline Page - Deal tracking and diligence
 *
 * Integrated with Deal Pipeline API to display and manage deals.
 * Features:
 * - Kanban-style pipeline view grouped by status
 * - Real-time deal creation via modal
 * - CSV import functionality
 * - Loading states and error handling
 * - Responsive design with mobile support
 *
 * API Endpoints Used:
 * - GET /api/deals/opportunities - List all deals
 * - GET /api/deals/stages - Get pipeline stages
 * - POST /api/deals/opportunities - Create new deal
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearch, useLocation } from 'wouter';
import { useFundContext } from '@/contexts/FundContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { DealCard } from '@/components/pipeline/DealCard';
import { AddDealModal } from '@/components/pipeline/AddDealModal';
import { ImportDealsModal } from '@/components/pipeline/ImportDealsModal';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useFeatureFlag, type FlagKey } from '@/core/flags/flagAdapter';
import {
  Plus,
  Upload,
  LineChart,
  RefreshCw,
  AlertCircle,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import type { DealOpportunity, PipelineStage } from '@shared/schema';

// Pipeline status configuration
const PIPELINE_STATUSES = [
  { key: 'lead', label: 'Lead', color: 'bg-gray-100' },
  { key: 'qualified', label: 'Qualified', color: 'bg-blue-100' },
  { key: 'pitch', label: 'Pitch', color: 'bg-purple-100' },
  { key: 'dd', label: 'Due Diligence', color: 'bg-amber-100' },
  { key: 'committee', label: 'Committee', color: 'bg-indigo-100' },
  { key: 'term_sheet', label: 'Term Sheet', color: 'bg-pink-100' },
  { key: 'closed', label: 'Closed', color: 'bg-green-100' },
  { key: 'passed', label: 'Passed', color: 'bg-red-100' },
] as const;

// Type for view mode
type ViewMode = 'kanban' | 'list';

// API response types
interface DealsResponse {
  success: boolean;
  data: DealOpportunity[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    count: number;
  };
}

interface StagesResponse {
  success: boolean;
  data: PipelineStage[];
}

// Loading skeleton for deals
function DealCardSkeleton() {
  return (
    <Card className="border-pov-beige/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton for kanban column
function KanbanColumnSkeleton() {
  return (
    <div className="min-w-[280px] flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="space-y-3">
        <DealCardSkeleton />
        <DealCardSkeleton />
      </div>
    </div>
  );
}

// Empty state component
function EmptyPipelineState({ onAddDeal }: { onAddDeal: () => void }) {
  return (
    <Card className="border-dashed border-2 border-pov-beige bg-white/50">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-pov-charcoal/5 flex items-center justify-center mb-4">
          <LineChart className="h-8 w-8 text-pov-charcoal/40" />
        </div>
        <CardTitle className="font-inter text-xl text-pov-charcoal">
          No deals in your pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="font-poppins text-sm text-gray-500 mb-6 max-w-md mx-auto">
          Add deals to track diligence, scoring, and next steps. Import existing deals from a
          spreadsheet or add them manually.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={onAddDeal}
            className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add deal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Error state component
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="pt-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h3 className="font-inter font-semibold text-red-900 mb-2">Failed to load deals</h3>
        <p className="font-poppins text-sm text-red-700 mb-4">
          There was an error loading your pipeline. Please try again.
        </p>
        <Button
          onClick={onRetry}
          variant="outline"
          className="border-red-300 text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

// Kanban view component
function KanbanView({
  deals,
  onDealClick,
}: {
  deals: DealOpportunity[];
  onDealClick: (deal: DealOpportunity) => void;
}) {
  // Group deals by status
  const dealsByStatus = PIPELINE_STATUSES.reduce(
    (acc, { key }) => {
      acc[key] = deals.filter((deal) => deal.status === key);
      return acc;
    },
    {} as Record<string, DealOpportunity[]>
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
      {PIPELINE_STATUSES.map(({ key, label, color }) => {
        const statusDeals = dealsByStatus[key] || [];
        return (
          <div key={key} className="min-w-[280px] w-[280px] flex-shrink-0">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <h3 className="font-inter font-semibold text-sm text-pov-charcoal">{label}</h3>
              </div>
              <Badge variant="outline" className="font-poppins text-xs">
                {statusDeals.length}
              </Badge>
            </div>

            {/* Deals Column */}
            <div className="space-y-3">
              {statusDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} onClick={() => onDealClick(deal)} />
              ))}
              {statusDeals.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <p className="font-poppins text-xs text-gray-400">No deals</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// List view component
function ListView({
  deals,
  onDealClick,
  selectedIds,
  onToggleSelect,
}: {
  deals: DealOpportunity[];
  onDealClick: (deal: DealOpportunity) => void;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
}) {
  return (
    <div className="space-y-2">
      {deals.map((deal) => (
        <div
          key={deal.id}
          role="button"
          tabIndex={0}
          onClick={() => onDealClick(deal)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onDealClick(deal);
            }
          }}
          aria-label={`${deal.companyName}, ${deal.sector}, ${deal.priority} priority`}
          className={`flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-sm cursor-pointer transition-shadow ${
            selectedIds?.has(deal.id)
              ? 'border-pov-charcoal ring-1 ring-pov-charcoal/20'
              : 'border-pov-beige/50'
          }`}
        >
          <div className="flex items-center gap-4">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={selectedIds?.has(deal.id) ?? false}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(deal.id);
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded border-gray-300 accent-pov-charcoal"
                data-testid={`deal-checkbox-${deal.id}`}
              />
            )}
            <div className="w-10 h-10 rounded-full bg-pov-charcoal/5 flex items-center justify-center">
              <LineChart className="h-5 w-5 text-pov-charcoal/40" />
            </div>
            <div>
              <h4 className="font-inter font-semibold text-pov-charcoal">{deal.companyName}</h4>
              <p className="font-poppins text-xs text-gray-500">
                {deal.sector} • {deal.stage}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">
              {PIPELINE_STATUSES.find((s) => s.key === deal.status)?.label || deal.status}
            </Badge>
            <Badge
              variant="outline"
              className={
                deal.priority === 'high'
                  ? 'bg-red-50 text-red-700'
                  : deal.priority === 'medium'
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-green-50 text-green-700'
              }
            >
              {deal.priority.charAt(0).toUpperCase() + deal.priority.slice(1)}
            </Badge>
            {deal.dealSize && Number.isFinite(parseFloat(String(deal.dealSize))) && (
              <span className="font-poppins text-sm text-gray-600 hidden sm:block">
                ${(parseFloat(String(deal.dealSize)) / 1000000).toFixed(1)}M
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Sort options for the toolbar
const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'companyName:asc', label: 'Name A-Z' },
  { value: 'companyName:desc', label: 'Name Z-A' },
  { value: 'dealSize:desc', label: 'Largest deals' },
] as const;

/** Build /api/deals/opportunities URL with query params */
function buildDealsUrl(params: {
  search?: string;
  status?: string;
  priority?: string;
  sortBy?: string;
  sortDir?: string;
  limit?: number;
}): string {
  const url = new URL('/api/deals/opportunities', window.location.origin);
  if (params.search) url.searchParams.set('search', params.search);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.priority) url.searchParams.set('priority', params.priority);
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortDir) url.searchParams.set('sortDir', params.sortDir);
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  return url.pathname + url.search;
}

// Read filter state from URL search params
function useFilterState() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);

  const filters = {
    search: params.get('q') ?? '',
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    sort: params.get('sort') ?? 'createdAt:desc',
    view: (params.get('view') ?? 'kanban') as ViewMode,
  };

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(rawSearch);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      navigate(`/pipeline${qs ? `?${qs}` : ''}`, { replace: true });
    },
    [rawSearch, navigate]
  );

  return { filters, setFilter };
}

// Main Pipeline Page Component
export default function PipelinePage() {
  const { toast } = useToast();
  const { fundId } = useFundContext();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { filters, setFilter } = useFilterState();
  const viewMode = filters.view;

  // Debounced search
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (searchInput === filters.search) return;
    debounceRef.current = setTimeout(() => setFilter('q', searchInput), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput, filters.search, setFilter]);

  // Parse sort param
  const [sortBy, sortDir] = filters.sort.split(':') as [string, string];

  // Custom queryFn: build URL with filter/sort params
  const dealsUrl = buildDealsUrl({
    ...(filters.search && { search: filters.search }),
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    sortBy,
    sortDir,
    limit: 100,
  });

  const {
    data: dealsResponse,
    isLoading: isLoadingDeals,
    error: dealsError,
    refetch: refetchDeals,
  } = useQuery<DealsResponse>({
    queryKey: [
      '/api/deals/opportunities',
      filters.search,
      filters.status,
      filters.priority,
      filters.sort,
    ],
    queryFn: async () => {
      const res = await fetch(dealsUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deals');
      return res.json() as Promise<DealsResponse>;
    },
  });

  // Fetch pipeline stages (for future use when custom stages are supported)
  useQuery<StagesResponse>({ queryKey: ['/api/deals/stages'] });

  const rawDeals = dealsResponse?.data;
  const deals = rawDeals ?? [];
  const hasDeals = deals.length > 0;
  const hasFilters = !!filters.search || !!filters.status || !!filters.priority;

  const handleDealClick = (deal: DealOpportunity) => {
    toast({
      title: deal.companyName,
      description: 'Deal detail page coming soon...',
    });
  };

  const clearFilters = () => {
    setSearchInput('');
    setFilter('q', '');
    setFilter('status', '');
    setFilter('priority', '');
  };

  // Bulk selection (behind feature flag)
  const bulkEnabled = useFeatureFlag('enable_pipeline_bulk_actions' as FlagKey);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set((rawDeals ?? []).map((d) => d.id)));
  }, [rawDeals]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes?: string }) => {
      return apiRequest('POST', '/api/deals/opportunities/bulk/status', {
        dealIds: Array.from(selectedIds),
        status,
        notes,
      });
    },
    onSuccess: () => {
      toast({ title: 'Deals updated', description: `${selectedIds.size} deal(s) moved.` });
      clearSelection();
      refetchDeals();
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk update failed', description: err.message, variant: 'destructive' });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/deals/opportunities/bulk/archive', {
        dealIds: Array.from(selectedIds),
      });
    },
    onSuccess: () => {
      toast({ title: 'Deals archived', description: `${selectedIds.size} deal(s) archived.` });
      clearSelection();
      refetchDeals();
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk archive failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Pipeline"
        subtitle="Track deals, diligence progress, and investment decisions"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="font-inter text-2xl font-bold text-pov-charcoal">Deal Pipeline</h2>
            <p className="font-poppins text-sm text-gray-500">
              {hasDeals
                ? `${deals.length} deal${deals.length !== 1 ? 's' : ''} in pipeline`
                : 'Manage your deal flow'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-pov-beige hover:bg-pov-beige/20"
              onClick={() => setIsImportModalOpen(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Import deals</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button
              className="bg-pov-charcoal hover:bg-pov-charcoal/90 text-pov-white"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add deal</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Toolbar: Search, Filters, Sort, View Toggle */}
        <div className="flex flex-col sm:flex-row gap-2 mb-6" data-testid="pipeline-toolbar">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search deals..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-8 bg-white border-pov-beige"
              data-testid="pipeline-search"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setFilter('q', '');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => setFilter('status', v === 'all' ? '' : v)}
          >
            <SelectTrigger
              className="w-[140px] bg-white border-pov-beige"
              data-testid="pipeline-status-filter"
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PIPELINE_STATUSES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select
            value={filters.priority || 'all'}
            onValueChange={(v) => setFilter('priority', v === 'all' ? '' : v)}
          >
            <SelectTrigger
              className="w-[130px] bg-white border-pov-beige"
              data-testid="pipeline-priority-filter"
            >
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={filters.sort} onValueChange={(v) => setFilter('sort', v)}>
            <SelectTrigger
              className="w-[160px] bg-white border-pov-beige"
              data-testid="pipeline-sort"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-white border border-pov-beige rounded-lg p-1">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('view', 'kanban')}
              className={viewMode === 'kanban' ? 'bg-pov-charcoal text-white' : 'text-gray-600'}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('view', 'list')}
              className={viewMode === 'list' ? 'bg-pov-charcoal text-white' : 'text-gray-600'}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Bulk Actions Toolbar */}
        {bulkEnabled && selectedIds.size > 0 && (
          <div
            className="flex items-center gap-3 mb-4 p-3 bg-pov-charcoal/5 rounded-lg border border-pov-beige"
            data-testid="bulk-toolbar"
          >
            <Badge variant="secondary" className="font-poppins">
              {selectedIds.size} selected
            </Badge>
            <Select onValueChange={(status) => bulkStatusMutation.mutate({ status })}>
              <SelectTrigger
                className="w-[150px] bg-white border-pov-beige"
                data-testid="bulk-status-select"
              >
                <SelectValue placeholder="Move to..." />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STATUSES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkArchiveMutation.mutate()}
              disabled={bulkArchiveMutation.isPending}
              className="border-red-200 text-red-700 hover:bg-red-50"
              data-testid="bulk-archive-btn"
            >
              Archive
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="text-gray-500">
              Clear
            </Button>
            {deals.length > selectedIds.size && (
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-gray-500">
                Select all ({deals.length})
              </Button>
            )}
          </div>
        )}

        {/* Main Content */}
        {dealsError ? (
          <ErrorState onRetry={() => refetchDeals()} />
        ) : isLoadingDeals ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <KanbanColumnSkeleton key={i} />
            ))}
          </div>
        ) : !hasDeals && !hasFilters ? (
          <EmptyPipelineState onAddDeal={() => setIsAddModalOpen(true)} />
        ) : !hasDeals && hasFilters ? (
          <Card className="border-pov-beige/50 bg-white/50">
            <CardContent className="pt-6 text-center">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="font-inter font-medium text-pov-charcoal mb-1">No matching deals</p>
              <p className="font-poppins text-sm text-gray-500 mb-4">
                Try adjusting your filters or search terms.
              </p>
              <Button variant="outline" onClick={clearFilters} className="border-pov-beige">
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {viewMode === 'kanban' ? (
              <KanbanView deals={deals} onDealClick={handleDealClick} />
            ) : (
              <ListView
                deals={deals}
                onDealClick={handleDealClick}
                {...(bulkEnabled && { selectedIds, onToggleSelect: toggleSelection })}
              />
            )}
          </>
        )}

        {/* Feature Preview (only show when empty and no filters) */}
        {!hasDeals && !isLoadingDeals && !dealsError && !hasFilters && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-white/80">
              <CardContent className="pt-6">
                <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                  Deal Scoring
                </h3>
                <p className="font-poppins text-xs text-gray-500">
                  Score deals on team, market, product, and traction metrics
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/80">
              <CardContent className="pt-6">
                <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                  Diligence Tracking
                </h3>
                <p className="font-poppins text-xs text-gray-500">
                  Track diligence checklist progress and key findings
                </p>
              </CardContent>
            </Card>
            <Card className="bg-white/80">
              <CardContent className="pt-6">
                <h3 className="font-inter font-semibold text-sm text-pov-charcoal mb-2">
                  Decision Workflow
                </h3>
                <p className="font-poppins text-xs text-gray-500">
                  Move deals through stages from sourcing to close
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddDealModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        {...(fundId != null && { fundId })}
      />

      <ImportDealsModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        {...(fundId != null && { fundId })}
      />
    </div>
  );
}
