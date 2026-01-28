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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { POVBrandHeader } from '@/components/ui/POVLogo';
import { DealCard } from '@/components/pipeline/DealCard';
import { AddDealModal } from '@/components/pipeline/AddDealModal';
import { ImportDealsModal } from '@/components/pipeline/ImportDealsModal';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, LineChart, RefreshCw, AlertCircle, LayoutGrid, List } from 'lucide-react';
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
                <div className={`w-2 h-2 rounded-full ${color.replace('bg-', 'bg-')}`} />
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
}: {
  deals: DealOpportunity[];
  onDealClick: (deal: DealOpportunity) => void;
}) {
  return (
    <div className="space-y-2">
      {deals.map((deal) => (
        <div
          key={deal.id}
          onClick={() => onDealClick(deal)}
          className="flex items-center justify-between p-4 bg-white border border-pov-beige/50 rounded-lg hover:shadow-sm cursor-pointer transition-shadow"
        >
          <div className="flex items-center gap-4">
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
            {deal.dealSize && (
              <span className="font-poppins text-sm text-gray-600 hidden sm:block">
                ${(parseFloat(deal.dealSize.toString()) / 1000000).toFixed(1)}M
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Pipeline Page Component
export default function PipelinePage() {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [_selectedDeal, setSelectedDeal] = useState<DealOpportunity | null>(null);

  // Fetch deals from API
  const {
    data: dealsResponse,
    isLoading: isLoadingDeals,
    error: dealsError,
    refetch: refetchDeals,
  } = useQuery<DealsResponse>({
    queryKey: ['/api/deals/opportunities'],
  });

  // Fetch pipeline stages (for future use when custom stages are supported)
  const { data: _stagesResponse } = useQuery<StagesResponse>({
    queryKey: ['/api/deals/stages'],
  });

  const deals = dealsResponse?.data || [];
  const hasDeals = deals.length > 0;

  // Handle deal click
  const handleDealClick = (deal: DealOpportunity) => {
    setSelectedDeal(deal);
    // TODO: Navigate to deal detail page when implemented
    toast({
      title: deal.companyName,
      description: 'Deal detail page coming soon...',
    });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <POVBrandHeader
        title="Pipeline"
        subtitle="Track deals, diligence progress, and investment decisions"
        variant="light"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-inter text-2xl font-bold text-pov-charcoal">Deal Pipeline</h2>
            <p className="font-poppins text-sm text-gray-500">
              {hasDeals ? `${deals.length} deals in pipeline` : 'Manage your deal flow'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            {hasDeals && (
              <div className="flex items-center bg-white border border-pov-beige rounded-lg p-1 mr-2">
                <Button
                  variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('kanban')}
                  className={viewMode === 'kanban' ? 'bg-pov-charcoal text-white' : 'text-gray-600'}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-pov-charcoal text-white' : 'text-gray-600'}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}

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

        {/* Main Content */}
        {dealsError ? (
          <ErrorState onRetry={() => refetchDeals()} />
        ) : isLoadingDeals ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <KanbanColumnSkeleton key={i} />
            ))}
          </div>
        ) : !hasDeals ? (
          <EmptyPipelineState onAddDeal={() => setIsAddModalOpen(true)} />
        ) : (
          <>
            {viewMode === 'kanban' ? (
              <KanbanView deals={deals} onDealClick={handleDealClick} />
            ) : (
              <ListView deals={deals} onDealClick={handleDealClick} />
            )}
          </>
        )}

        {/* Feature Preview (only show when empty) */}
        {!hasDeals && !isLoadingDeals && !dealsError && (
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
      <AddDealModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />

      <ImportDealsModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
    </div>
  );
}
