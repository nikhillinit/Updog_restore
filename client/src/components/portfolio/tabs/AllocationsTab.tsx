/**
 * Allocations Tab Component
 * Displays allocation state for all companies in a fund
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertCircle, ArrowLeft, RefreshCw, Save, Search } from 'lucide-react';
import { useLatestAllocations } from './hooks/useLatestAllocations';
import {
  useAllocationScenarioApplyPreview,
  useAllocationScenarioDetail,
  useAllocationScenarioList,
  useApplyAllocationScenario,
  useCreateAllocationScenario,
  useSyncAllocationScenario,
  useUpdateAllocationScenario,
} from './hooks/useAllocationScenarios';
import { EditAllocationDialog } from './EditAllocationDialog';
import { createAllocationsColumns } from './allocations-table-columns';
import { formatCents } from '@/lib/units';
import type {
  AllocationCompany,
  AllocationScenarioCollaborationContext,
  AllocationScenarioCollaborationContextEvent,
  AllocationScenarioChangeSummary,
  AllocationScenarioApplyPreview,
  AllocationScenarioDetail,
  AllocationScenarioSnapshotItem,
  CreateAllocationScenarioPayload,
  UpdateAllocationPayload,
} from './types';

function buildScenarioSnapshotItems(
  companies: AllocationCompany[]
): AllocationScenarioSnapshotItem[] {
  return companies.map((company) => ({
    company_id: company.company_id,
    planned_reserves_cents: company.planned_reserves_cents,
    allocation_cap_cents: company.allocation_cap_cents,
    allocation_reason: company.allocation_reason,
  }));
}

function hydrateScenarioWorkspace(
  baselineCompanies: AllocationCompany[],
  scenario: AllocationScenarioDetail
): AllocationCompany[] {
  const snapshotByCompanyId = new Map(
    scenario.snapshot_items.map((item) => [item.company_id, item])
  );

  return baselineCompanies.map((company) => {
    const snapshot = snapshotByCompanyId.get(company.company_id);
    if (!snapshot) {
      return company;
    }

    return {
      ...company,
      planned_reserves_cents: snapshot.planned_reserves_cents,
      allocation_cap_cents: snapshot.allocation_cap_cents,
      allocation_reason: snapshot.allocation_reason,
    };
  });
}

function getSourceAllocationVersion(companies: AllocationCompany[]): number | null {
  const versions = companies
    .map((company) => company.allocation_version)
    .filter((version) => Number.isInteger(version) && version > 0);

  return versions.length > 0 ? Math.max(...versions) : null;
}

function formatDateLabel(value: string | null | undefined, emptyLabel: string) {
  return value ? format(new Date(value), 'MMM d, yyyy') : emptyLabel;
}

function formatActionStatusLabel(
  actionLabel: string,
  value: string | null | undefined,
  actor: string | null | undefined,
  emptyLabel: string
) {
  if (!value) {
    return emptyLabel;
  }

  const formattedDate = format(new Date(value), 'MMM d, yyyy');
  return actor ? `${actionLabel} ${formattedDate} by ${actor}` : `${actionLabel} ${formattedDate}`;
}

function getApplyPreviewDescription(preview: AllocationScenarioApplyPreview) {
  if (preview.apply_state === 'blocked') {
    return 'The live company set changed. Sync from live or save a new scenario before applying.';
  }

  if (preview.apply_state === 'confirmable_with_drift') {
    return 'Live allocations moved since this scenario version. Review the drift summary before applying.';
  }

  return 'This scenario is ready to apply to the live allocation surface.';
}

function getApplyStateBadgeLabel(preview: AllocationScenarioApplyPreview) {
  if (preview.apply_state === 'blocked') {
    return 'Apply blocked';
  }

  if (preview.apply_state === 'confirmable_with_drift') {
    return 'Confirm with drift';
  }

  return 'Apply allowed';
}

function getDriftStatusBadgeLabel(preview: AllocationScenarioApplyPreview) {
  if (preview.drift_status === 'company_set_changed') {
    return 'Company set changed';
  }

  if (preview.drift_status === 'stale_but_mappable') {
    return 'Live drift detected';
  }

  return 'Exact live match';
}

function formatDeltaLabel(value: number) {
  if (value === 0) {
    return formatCents(0);
  }

  const absoluteValue = formatCents(Math.abs(value), { compact: true });
  return `${value > 0 ? '+' : '-'}${absoluteValue}`;
}

function formatAppliedStatusLabel(
  value: string | null | undefined,
  actor: string | null | undefined,
  allocationVersion: number | null | undefined
) {
  const baseLabel = formatActionStatusLabel('Applied', value, actor, 'Not applied to live');

  if (!value || !allocationVersion) {
    return baseLabel;
  }

  return `${baseLabel} (v${allocationVersion})`;
}

function formatContextTimestamp(value: string | null | undefined) {
  return value ? format(new Date(value), 'MMM d, yyyy h:mm a') : 'Not available';
}

function formatContextSummaryBadgeLabel(
  count: number,
  singularLabel: string,
  pluralLabel = `${singularLabel}s`
) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

function formatContextChangeSummary(summary: AllocationScenarioChangeSummary) {
  return [
    formatContextSummaryBadgeLabel(
      summary.companies_changed,
      'changed company',
      'changed companies'
    ),
    formatContextSummaryBadgeLabel(
      summary.companies_unchanged,
      'unchanged company',
      'unchanged companies'
    ),
    formatContextSummaryBadgeLabel(
      summary.scenario_only_count,
      'scenario-only company',
      'scenario-only companies'
    ),
    formatContextSummaryBadgeLabel(
      summary.live_only_count,
      'live-only company',
      'live-only companies'
    ),
    `${formatDeltaLabel(summary.total_planned_delta_cents)} planned delta`,
  ];
}

function CollaborationContextEventCard({
  title,
  event,
  emptyLabel,
}: {
  title: string;
  event: AllocationScenarioCollaborationContextEvent | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-950">{title}</div>
          <div className="text-xs text-slate-600">
            {event ? formatContextTimestamp(event.at) : emptyLabel}
          </div>
        </div>
        <Badge variant="outline" className="border-slate-300 text-slate-700">
          {event?.change_summary.headline ?? 'No summary yet'}
        </Badge>
      </div>

      {event ? (
        <>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
            {event.note?.trim() || 'No note recorded.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-100">
              {event.by ?? 'Unknown actor'}
            </Badge>
            <Badge variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-100">
              {formatContextTimestamp(event.at)}
            </Badge>
            {formatContextChangeSummary(event.change_summary).map((label) => (
              <Badge
                key={`${title}-${label}`}
                variant="secondary"
                className="bg-slate-100 text-slate-800 hover:bg-slate-100"
              >
                {label}
              </Badge>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          {title} has not been recorded yet for this scenario.
        </p>
      )}
    </div>
  );
}

export function AllocationsTab() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useLatestAllocations();
  const {
    data: scenarioListData,
    isLoading: isScenarioListLoading,
    error: scenarioListError,
  } = useAllocationScenarioList();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [workspaceCompanies, setWorkspaceCompanies] = useState<AllocationCompany[]>([]);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [workspaceSourceLabel, setWorkspaceSourceLabel] = useState('Live portfolio');
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioNotes, setScenarioNotes] = useState('');
  const [scenarioActionNote, setScenarioActionNote] = useState('');
  const [applyPreview, setApplyPreview] = useState<AllocationScenarioApplyPreview | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AllocationCompany;
    direction: 'asc' | 'desc';
  } | null>(null);

  const scenarios = scenarioListData?.scenarios ?? [];
  const activeScenarioDetail = useAllocationScenarioDetail(activeScenarioId, {
    enabled: !!activeScenarioId && !workspaceDirty,
  });
  const createScenarioMutation = useCreateAllocationScenario();
  const updateScenarioMutation = useUpdateAllocationScenario(activeScenarioId);
  const previewApplyMutation = useAllocationScenarioApplyPreview(activeScenarioId);
  const syncScenarioMutation = useSyncAllocationScenario(activeScenarioId);
  const applyScenarioMutation = useApplyAllocationScenario(activeScenarioId);

  const liveCompanies = useMemo(() => data?.companies ?? [], [data?.companies]);
  const displayedCompanies = workspaceCompanies.length > 0 ? workspaceCompanies : liveCompanies;
  const activeScenarioSummary =
    activeScenarioDetail.data ??
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    null;
  const activeScenarioContext: AllocationScenarioCollaborationContext | null =
    activeScenarioDetail.data?.context ?? null;
  const isScenarioPending =
    createScenarioMutation.isPending ||
    updateScenarioMutation.isPending ||
    previewApplyMutation.isPending ||
    syncScenarioMutation.isPending ||
    applyScenarioMutation.isPending;

  useEffect(() => {
    if (liveCompanies.length === 0 || activeScenarioId) {
      return;
    }

    setWorkspaceCompanies(liveCompanies);
    setWorkspaceDirty(false);
    setWorkspaceSourceLabel('Live portfolio');
  }, [activeScenarioId, liveCompanies]);

  useEffect(() => {
    if (!activeScenarioId || !activeScenarioDetail.data) {
      return;
    }

    setWorkspaceCompanies((current) =>
      hydrateScenarioWorkspace(
        liveCompanies.length > 0 ? liveCompanies : current,
        activeScenarioDetail.data
      )
    );
    setWorkspaceDirty(false);
    setWorkspaceSourceLabel(`Scenario: ${activeScenarioDetail.data.name}`);
    setScenarioName(activeScenarioDetail.data.name);
    setScenarioNotes(activeScenarioDetail.data.notes ?? '');
  }, [activeScenarioDetail.data, activeScenarioId, liveCompanies]);

  useEffect(() => {
    if (!activeScenarioId || workspaceDirty) {
      setApplyPreview(null);
    }
  }, [activeScenarioId, workspaceDirty]);

  useEffect(() => {
    setApplyPreview(null);
  }, [activeScenarioDetail.data?.updated_at]);

  const selectedCompany = useMemo(
    () => displayedCompanies.find((company) => company.company_id === selectedCompanyId) ?? null,
    [displayedCompanies, selectedCompanyId]
  );

  const handleEdit = useCallback((company: AllocationCompany) => {
    setSelectedCompanyId(company.company_id);
    setIsEditDialogOpen(true);
  }, []);

  const handleScenarioWorkspaceSave = useCallback((update: UpdateAllocationPayload) => {
    setWorkspaceCompanies((current) =>
      current.map((company) =>
        company.company_id === update.company_id
          ? {
              ...company,
              planned_reserves_cents: update.planned_reserves_cents,
              allocation_cap_cents: update.allocation_cap_cents,
              allocation_reason: update.allocation_reason,
            }
          : company
      )
    );
    setWorkspaceDirty(true);
  }, []);

  const columns = useMemo(() => createAllocationsColumns(handleEdit), [handleEdit]);

  const reservePlanCount = useMemo(
    () => displayedCompanies.filter((company) => company.planned_reserves_cents > 0).length,
    [displayedCompanies]
  );
  const documentedPlanCount = useMemo(
    () => displayedCompanies.filter((company) => Boolean(company.allocation_reason?.trim())).length,
    [displayedCompanies]
  );

  const workspaceTotals = useMemo(
    () => ({
      total_planned_cents: displayedCompanies.reduce(
        (sum, company) => sum + company.planned_reserves_cents,
        0
      ),
      total_deployed_cents: displayedCompanies.reduce(
        (sum, company) => sum + company.deployed_reserves_cents,
        0
      ),
    }),
    [displayedCompanies]
  );

  const lastUpdatedLabel = useMemo(
    () => formatDateLabel(data?.metadata.last_updated_at, 'Not yet synced'),
    [data?.metadata.last_updated_at]
  );

  const activeScenarioLastModifiedLabel = useMemo(
    () => formatDateLabel(activeScenarioSummary?.updated_at, 'Not yet saved'),
    [activeScenarioSummary?.updated_at]
  );

  const activeScenarioLastSyncedLabel = useMemo(
    () =>
      formatActionStatusLabel(
        'Synced',
        activeScenarioSummary?.last_synced_at,
        activeScenarioSummary?.last_synced_by,
        'Not synced from live'
      ),
    [activeScenarioSummary?.last_synced_at, activeScenarioSummary?.last_synced_by]
  );

  const activeScenarioLastAppliedLabel = useMemo(
    () =>
      formatAppliedStatusLabel(
        activeScenarioSummary?.last_applied_at,
        activeScenarioSummary?.last_applied_by,
        activeScenarioSummary?.last_applied_allocation_version
      ),
    [
      activeScenarioSummary?.last_applied_allocation_version,
      activeScenarioSummary?.last_applied_at,
      activeScenarioSummary?.last_applied_by,
    ]
  );

  const sectors = useMemo(
    () => Array.from(new Set(displayedCompanies.map((company) => company.sector))).sort(),
    [displayedCompanies]
  );

  const statuses = useMemo(
    () => Array.from(new Set(displayedCompanies.map((company) => company.status))).sort(),
    [displayedCompanies]
  );

  const filteredAndSortedCompanies = useMemo(() => {
    let filtered = displayedCompanies.filter((company) => {
      const matchesSearch = company.company_name.toLowerCase().includes(searchQuery.toLowerCase());
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
  }, [displayedCompanies, searchQuery, sectorFilter, sortConfig, statusFilter]);

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

  const enrichedColumns = columns.map((column) => ({
    ...column,
    column: {
      toggleSorting: () => {
        if (column.accessorKey) {
          handleSort(column.accessorKey);
        }
      },
    },
  }));

  const resetToLiveWorkspace = useCallback(() => {
    setActiveScenarioId(null);
    setWorkspaceCompanies(liveCompanies);
    setWorkspaceDirty(false);
    setWorkspaceSourceLabel('Live portfolio');
    setScenarioName('');
    setScenarioNotes('');
    setScenarioActionNote('');
    setApplyPreview(null);
    setSelectedCompanyId(null);
  }, [liveCompanies]);

  const handleResumeScenario = useCallback((scenarioId: string) => {
    setActiveScenarioId(scenarioId);
    setWorkspaceDirty(false);
    setWorkspaceSourceLabel('Loading scenario...');
    setScenarioActionNote('');
    setApplyPreview(null);
    setSelectedCompanyId(null);
  }, []);

  const buildScenarioPayload = useCallback((): CreateAllocationScenarioPayload => {
    const snapshotSource = displayedCompanies.length > 0 ? displayedCompanies : liveCompanies;

    return {
      name: scenarioName.trim(),
      notes: scenarioNotes.trim() || null,
      source_allocation_version: getSourceAllocationVersion(snapshotSource),
      snapshot_items: buildScenarioSnapshotItems(snapshotSource),
    };
  }, [displayedCompanies, liveCompanies, scenarioName, scenarioNotes]);

  const handleSaveScenario = useCallback(async () => {
    const trimmedName = scenarioName.trim();
    if (!trimmedName) {
      toast({
        title: 'Scenario name required',
        description: 'Add a scenario name before saving.',
        variant: 'destructive',
      });
      return;
    }

    const payload = buildScenarioPayload();
    const baselineCompanies = liveCompanies.length > 0 ? liveCompanies : displayedCompanies;

    try {
      const scenario = activeScenarioId
        ? await updateScenarioMutation.mutateAsync(payload)
        : await createScenarioMutation.mutateAsync(payload);

      setActiveScenarioId(scenario.id);
      setWorkspaceCompanies(hydrateScenarioWorkspace(baselineCompanies, scenario));
      setWorkspaceDirty(false);
      setWorkspaceSourceLabel(`Scenario: ${scenario.name}`);
      setScenarioName(scenario.name);
      setScenarioNotes(scenario.notes ?? '');
      setApplyPreview(null);

      toast({
        title: activeScenarioId ? 'Scenario saved' : 'Scenario created',
        description: `${scenario.name} is ready to resume from this workspace.`,
      });
    } catch (mutationError) {
      toast({
        title: 'Scenario save failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to save allocation scenario',
        variant: 'destructive',
      });
    }
  }, [
    activeScenarioId,
    buildScenarioPayload,
    createScenarioMutation,
    displayedCompanies,
    liveCompanies,
    scenarioName,
    toast,
    updateScenarioMutation,
  ]);

  const handleRenameScenario = useCallback(async () => {
    if (!activeScenarioId) {
      return;
    }

    const trimmedName = scenarioName.trim();
    if (!trimmedName) {
      toast({
        title: 'Scenario name required',
        description: 'Add a scenario name before renaming it.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const scenario = await updateScenarioMutation.mutateAsync({
        name: trimmedName,
        notes: scenarioNotes.trim() || null,
      });

      setWorkspaceSourceLabel(`Scenario: ${scenario.name}`);
      setScenarioName(scenario.name);
      setScenarioNotes(scenario.notes ?? '');
      setApplyPreview(null);

      toast({
        title: 'Scenario renamed',
        description: `${scenario.name} metadata has been updated.`,
      });
    } catch (mutationError) {
      toast({
        title: 'Scenario rename failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to rename allocation scenario',
        variant: 'destructive',
      });
    }
  }, [activeScenarioId, scenarioName, scenarioNotes, toast, updateScenarioMutation]);

  const handleLoadApplyPreview = useCallback(async () => {
    if (!activeScenarioId) {
      return;
    }

    if (workspaceDirty) {
      toast({
        title: 'Save scenario changes first',
        description: 'Save or discard local edits before previewing apply.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const preview = await previewApplyMutation.mutateAsync();
      setApplyPreview(preview);
    } catch (mutationError) {
      toast({
        title: 'Preview failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to preview allocation scenario apply',
        variant: 'destructive',
      });
    }
  }, [activeScenarioId, previewApplyMutation, toast, workspaceDirty]);

  const handleSyncFromLive = useCallback(async () => {
    if (!activeScenarioId) {
      return;
    }

    if (workspaceDirty) {
      toast({
        title: 'Save scenario changes first',
        description: 'Save or discard local edits before syncing from live.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await syncScenarioMutation.mutateAsync({
        note: scenarioActionNote.trim() || null,
      });

      setWorkspaceCompanies((current) =>
        hydrateScenarioWorkspace(liveCompanies.length > 0 ? liveCompanies : current, result.scenario)
      );
      setWorkspaceDirty(false);
      setWorkspaceSourceLabel(`Scenario: ${result.scenario.name}`);
      setScenarioName(result.scenario.name);
      setScenarioNotes(result.scenario.notes ?? '');
      setScenarioActionNote('');
      setApplyPreview(null);

      toast({
        title: 'Scenario synced',
        description:
          result.event.change_summary.headline ??
          `${result.scenario.name} now matches the current live allocation surface.`,
      });
    } catch (mutationError) {
      toast({
        title: 'Scenario sync failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to sync allocation scenario',
        variant: 'destructive',
      });
    }
  }, [activeScenarioId, liveCompanies, scenarioActionNote, syncScenarioMutation, toast, workspaceDirty]);

  const handleApplyScenario = useCallback(async () => {
    if (!activeScenarioId || !applyPreview) {
      toast({
        title: 'Preview required',
        description: 'Run apply preview before applying this scenario to live allocations.',
        variant: 'destructive',
      });
      return;
    }

    if (workspaceDirty) {
      toast({
        title: 'Save scenario changes first',
        description: 'Save or discard local edits before applying this scenario.',
        variant: 'destructive',
      });
      return;
    }

    if (applyPreview.apply_state === 'blocked') {
      toast({
        title: 'Apply blocked',
        description: 'Sync from live or save a new scenario before applying.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await applyScenarioMutation.mutateAsync({
        preview_token: applyPreview.live_token,
        note: scenarioActionNote.trim() || null,
      });

      setWorkspaceCompanies((current) =>
        hydrateScenarioWorkspace(liveCompanies.length > 0 ? liveCompanies : current, result.scenario)
      );
      setWorkspaceDirty(false);
      setWorkspaceSourceLabel(`Scenario: ${result.scenario.name}`);
      setScenarioName(result.scenario.name);
      setScenarioNotes(result.scenario.notes ?? '');
      setScenarioActionNote('');
      setApplyPreview(null);
      await refetch();

      toast({
        title: 'Scenario applied',
        description:
          result.event.change_summary.headline ??
          `${result.scenario.name} has been applied to the live allocation surface.`,
      });
    } catch (mutationError) {
      toast({
        title: 'Scenario apply failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to apply allocation scenario',
        variant: 'destructive',
      });
    }
  }, [
    activeScenarioId,
    applyPreview,
    applyScenarioMutation,
    liveCompanies,
    refetch,
    scenarioActionNote,
    toast,
    workspaceDirty,
  ]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const combinedError = error || activeScenarioDetail.error || scenarioListError;
  if (combinedError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {combinedError instanceof Error ? combinedError.message : 'Failed to load allocations'}
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Alert>
    );
  }

  if (displayedCompanies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Company Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">No companies found</p>
            <p className="text-sm">There are no companies with allocation data for this fund.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Company Allocations</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage reserve allocations for {displayedCompanies.length} companies
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-lg text-purple-950">Reserve Planning Workspace</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{workspaceSourceLabel}</Badge>
                {workspaceDirty ? (
                  <Badge variant="outline" className="border-amber-300 text-amber-900">
                    Unsaved local edits
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-purple-200 text-purple-950">
                  {activeScenarioId
                    ? `Last modified ${activeScenarioLastModifiedLabel}`
                    : `Last synced ${lastUpdatedLabel}`}
                </Badge>
                {activeScenarioId ? (
                  <>
                    <Badge variant="outline" className="border-purple-200 text-purple-950">
                      {activeScenarioLastSyncedLabel}
                    </Badge>
                    <Badge variant="outline" className="border-purple-200 text-purple-950">
                      {activeScenarioLastAppliedLabel}
                    </Badge>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeScenarioId ? (
                <Button variant="outline" onClick={resetToLiveWorkspace}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Use Live Portfolio
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={handleRenameScenario}
                disabled={!activeScenarioId || isScenarioPending || !scenarioName.trim()}
              >
                Rename Scenario
              </Button>
              <Button
                onClick={handleSaveScenario}
                disabled={isScenarioPending || !scenarioName.trim()}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Scenario
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scenario-name">Scenario Name</Label>
                  <Input
                    id="scenario-name"
                    value={scenarioName}
                    onChange={(event) => setScenarioName(event.target.value)}
                    placeholder="e.g., 2026 follow-on plan"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Workspace Status</Label>
                  <div className="rounded-md border border-purple-200 bg-white/70 px-3 py-2 text-sm text-purple-950">
                    {activeScenarioId
                      ? 'Scenario mode keeps edits local until you save.'
                      : 'Live mode edits still update the canonical allocation surface.'}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="scenario-notes">Scenario Notes</Label>
                <Textarea
                  id="scenario-notes"
                  value={scenarioNotes}
                  onChange={(event) => setScenarioNotes(event.target.value)}
                  placeholder="Capture why this scenario exists and what changed in the workspace."
                  className="min-h-[110px] bg-white/80"
                />
              </div>

              {activeScenarioId ? (
                <div className="space-y-4 rounded-lg border border-purple-200 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-purple-950">Live Sync and Apply</div>
                      <div className="text-xs text-purple-900/70">
                        Sync refreshes this saved scenario from current live allocations. Apply
                        preview computes drift and captures the live concurrency token.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={handleSyncFromLive}
                        disabled={workspaceDirty || isScenarioPending}
                      >
                        {syncScenarioMutation.isPending ? 'Syncing...' : 'Sync From Live'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleLoadApplyPreview}
                        disabled={workspaceDirty || isScenarioPending}
                      >
                        {previewApplyMutation.isPending ? 'Loading Preview...' : 'Preview Apply'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="scenario-action-note">Action Note</Label>
                    <Textarea
                      id="scenario-action-note"
                      value={scenarioActionNote}
                      onChange={(event) => setScenarioActionNote(event.target.value)}
                      placeholder="Optional note saved with the next sync or apply event."
                      className="min-h-[90px] bg-white"
                    />
                  </div>

                  {workspaceDirty ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Save or discard local scenario edits before syncing from live or applying
                        to the live allocation surface.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {applyPreview ? (
                    <div className="space-y-4 rounded-lg border border-purple-200 bg-purple-50/60 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-purple-950">Apply Preview</div>
                          <div className="text-xs text-purple-900/80">
                            {getApplyPreviewDescription(applyPreview)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-purple-300 text-purple-950">
                            {getDriftStatusBadgeLabel(applyPreview)}
                          </Badge>
                          <Badge variant="secondary">{getApplyStateBadgeLabel(applyPreview)}</Badge>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Companies Changed
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {applyPreview.summary.companies_changed}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Companies Unchanged
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {applyPreview.summary.companies_unchanged}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Planned Delta
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {formatDeltaLabel(applyPreview.summary.total_planned_delta_cents)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Scenario-only Companies
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {applyPreview.summary.scenario_only_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Live-only Companies
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {applyPreview.summary.live_only_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-purple-900/60">
                            Live Allocation Version
                          </div>
                          <div className="mt-1 text-lg font-semibold text-purple-950">
                            {applyPreview.live.max_allocation_version !== null
                              ? `v${applyPreview.live.max_allocation_version}`
                              : 'No live version'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-xs text-purple-900/70">
                          Live snapshot:{' '}
                          {formatDateLabel(
                            applyPreview.live.last_updated_at,
                            'Live allocations have not been updated yet'
                          )}
                        </div>
                        <Button
                          onClick={handleApplyScenario}
                          disabled={
                            applyPreview.apply_state === 'blocked' || applyScenarioMutation.isPending
                          }
                        >
                          {applyScenarioMutation.isPending ? 'Applying...' : 'Confirm Apply'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-purple-900/70">
                      Preview apply to compute drift against the current live allocation surface
                      before confirming.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-950">Collaboration Context</div>
                    <div className="text-xs text-slate-700/70">
                      Durable sync and apply history from the server. Scenario notes stay in the
                      editor above, while company-level reasons remain on each allocation row.
                    </div>
                  </div>
                  <Badge variant="outline" className="border-slate-300 text-slate-700">
                    {activeScenarioContext ? 'Context loaded' : 'Select a saved scenario'}
                  </Badge>
                </div>

                {activeScenarioId && activeScenarioContext ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <CollaborationContextEventCard
                      title="Last Sync"
                      event={activeScenarioContext.last_sync ?? null}
                      emptyLabel={
                        activeScenarioDetail.isLoading
                          ? 'Loading scenario context...'
                          : 'No sync recorded yet'
                      }
                    />
                    <CollaborationContextEventCard
                      title="Last Apply"
                      event={activeScenarioContext.last_apply ?? null}
                      emptyLabel={
                        activeScenarioDetail.isLoading
                          ? 'Loading scenario context...'
                          : 'No apply recorded yet'
                      }
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    Resume a saved scenario to view its durable sync and apply context here.
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-purple-900/70">Companies with plans</div>
                  <div className="text-2xl font-semibold text-purple-950 mt-1">
                    {reservePlanCount}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-purple-900/70">Documented notes</div>
                  <div className="text-2xl font-semibold text-purple-950 mt-1">
                    {documentedPlanCount}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-purple-900/70">Total planned</div>
                  <div className="text-2xl font-semibold text-purple-950 mt-1">
                    {formatCents(workspaceTotals.total_planned_cents, { compact: true })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-purple-200 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-purple-950">Saved Scenarios</div>
                  <div className="text-xs text-purple-900/70">
                    Resume a saved snapshot into the workspace.
                  </div>
                </div>
                <Badge variant="secondary">{scenarios.length}</Badge>
              </div>

              <div className="mt-3 space-y-3">
                {isScenarioListLoading ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : scenarios.length === 0 ? (
                  <p className="text-sm text-purple-900/70">
                    Save the current workspace to create the first durable scenario.
                  </p>
                ) : (
                  scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className={`rounded-md border p-3 ${
                        scenario.id === activeScenarioId
                          ? 'border-purple-400 bg-purple-100/80'
                          : 'border-purple-200 bg-white/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{scenario.name}</div>
                          <div className="text-xs text-gray-500">
                            Last modified {formatDateLabel(scenario.updated_at, 'Not yet saved')}
                          </div>
                          <div className="text-xs text-gray-500">
                            {scenario.company_count} companies ·{' '}
                            {formatCents(scenario.total_planned_cents, { compact: true })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatActionStatusLabel(
                              'Synced',
                              scenario.last_synced_at,
                              scenario.last_synced_by,
                              'Not synced from live'
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatAppliedStatusLabel(
                              scenario.last_applied_at,
                              scenario.last_applied_by,
                              scenario.last_applied_allocation_version
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={scenario.id === activeScenarioId ? 'secondary' : 'outline'}
                          onClick={() => handleResumeScenario(scenario.id)}
                        >
                          Resume
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        {scenario.notes?.trim() || 'No notes'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <p className="text-sm text-purple-900/80">
            Saved scenarios snapshot the current workspace. Resumed scenarios stay local until you
            save them again.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Total Planned Reserves</div>
            <div className="text-2xl font-bold text-purple-600 mt-1">
              {formatCents(workspaceTotals.total_planned_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Total Deployed Reserves</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {formatCents(workspaceTotals.total_deployed_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Remaining to Deploy</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {formatCents(
                workspaceTotals.total_planned_cents - workspaceTotals.total_deployed_cents,
                { compact: true }
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={sectorFilter}
          onChange={(event) => setSectorFilter(event.target.value)}
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
          onChange={(event) => setStatusFilter(event.target.value)}
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

      {searchQuery || sectorFilter !== 'all' || statusFilter !== 'all' ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {filteredAndSortedCompanies.length} of {displayedCompanies.length} companies
          </Badge>
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
        </div>
      ) : null}

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

      <EditAllocationDialog
        company={selectedCompany}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        mode={activeScenarioId ? 'scenario' : 'live'}
        onSaveScenarioDraft={handleScenarioWorkspaceSave}
      />
    </div>
  );
}
