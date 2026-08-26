/**
 * Allocations Tab Component
 * Displays allocation state for all companies in a fund
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useFundContext } from '@/contexts/FundContext';
import { useFlag } from '@/shared/useFlags';
import { useFeatureFlag } from '@/core/flags/flagAdapter';
import { format } from 'date-fns';
import { AlertCircle, ArrowLeft, Banknote, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { useLatestAllocations } from './hooks/useLatestAllocations';
import {
  useAllocationScenarioApplyPreview,
  useAllocationScenarioDecisions,
  useAllocationScenarioDetail,
  useAllocationScenarioList,
  useApplyAllocationScenario,
  useCreateReserveIcDecision,
  useCreateAllocationScenario,
  useSyncAllocationScenario,
  useUpdateReserveIcDecision,
  useUpdateAllocationScenario,
} from './hooks/useAllocationScenarios';
import { useReserveIcPacketEvidence } from './hooks/useReserveIcPacketEvidence';
import { AddCompanyDialog } from './AddCompanyDialog';
import { EditAllocationDialog } from './EditAllocationDialog';
import { FmvOverrideDialog } from './FmvOverrideDialog';
import { ReserveIcPacketCard } from './ReserveIcPacketCard';
import { AllocationActualsDisclosure } from './AllocationActualsDisclosure';
import { createAllocationsColumns, type ColumnDef } from './allocations-table-columns';
import { formatCents } from '@/lib/units';
import { buildReserveIcPacket } from './reserve-ic-packet';
import { useLatestPlanningFmvOverrides } from './hooks/usePlanningFmvOverrides';
import type {
  AllocationCompany,
  AllocationActualsDriftSummary,
  AllocationScenarioCollaborationContext,
  AllocationScenarioCollaborationContextEvent,
  AllocationScenarioChangeSummary,
  AllocationScenarioApplyPreview,
  AllocationScenarioDetail,
  AllocationScenarioSnapshotItem,
  ReserveIcDecision,
  CreateAllocationScenarioPayload,
  UpdateAllocationPayload,
} from './types';
import type { PlanningFmvOverrideRecord } from '@shared/contracts/lp-reporting';

const EMPTY_RESERVE_IC_DECISIONS: ReserveIcDecision[] = [];

const RESERVE_IC_DECISION_TYPE_OPTIONS = [
  { value: 'follow_on', label: 'follow on' },
  { value: 'defer', label: 'defer' },
  { value: 'cut_reserve', label: 'cut reserve' },
  { value: 'no_action', label: 'no action' },
] as const;

const RESERVE_IC_DECISION_STATUS_OPTIONS = [
  { value: 'draft', label: 'draft' },
  { value: 'proposed', label: 'proposed' },
  { value: 'approved', label: 'approved' },
  { value: 'rejected', label: 'rejected' },
] as const;

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

function formatPlanningFmvValue(value: string | null | undefined): string {
  if (!value) {
    return 'No approved mark';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
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

function formatDecisionTypeLabel(value: ReserveIcDecision['decisionType']) {
  return RESERVE_IC_DECISION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function formatDecisionStatusLabel(value: ReserveIcDecision['decisionStatus']) {
  return (
    RESERVE_IC_DECISION_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function toOptionalIntegerInput(value: number | null | undefined) {
  return value != null ? String(value) : '';
}

function parseOptionalNonNegativeInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Reserve values must be whole cents');
  }

  return Number(trimmed);
}

function formatOptionalDecisionCents(value: string) {
  return /^\d+$/.test(value.trim()) ? formatCents(Number(value), { compact: true }) : 'Not set';
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
    <div className="rounded-lg border border-beige-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium text-pov-charcoal">{title}</div>
          <div className="text-xs text-charcoal-600">
            {event ? formatContextTimestamp(event.at) : emptyLabel}
          </div>
        </div>
        <Badge variant="outline" className="border-charcoal-300 text-charcoal-700">
          {event?.change_summary.headline ?? 'No summary yet'}
        </Badge>
      </div>

      {event ? (
        <>
          <div className="mt-3 rounded-md border border-beige-200 bg-pov-gray/80 px-3 py-2 text-sm text-pov-charcoal">
            {event.note?.trim() || 'No note recorded.'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-pov-gray text-pov-charcoal hover:bg-pov-gray">
              {event.by ?? 'Unknown actor'}
            </Badge>
            <Badge variant="secondary" className="bg-pov-gray text-pov-charcoal hover:bg-pov-gray">
              {formatContextTimestamp(event.at)}
            </Badge>
            {formatContextChangeSummary(event.change_summary).map((label) => (
              <Badge
                key={`${title}-${label}`}
                variant="secondary"
                className="bg-pov-gray text-pov-charcoal hover:bg-pov-gray"
              >
                {label}
              </Badge>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-charcoal-600">
          {title} has not been recorded yet for this scenario.
        </p>
      )}
    </div>
  );
}

function ActualsDriftSummarySkeleton() {
  return (
    <section
      aria-label="Actuals drift summary"
      aria-busy="true"
      className="border-y border-beige-200 bg-white px-4 py-3"
    >
      <p className="text-sm font-medium text-pov-charcoal">Loading actuals drift disclosure</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {['Drifted', 'Material', 'Degraded'].map((label) => (
          <div key={label} className="flex items-center gap-2 text-xs text-charcoal-500">
            <Skeleton className="h-5 w-8 tabular-nums motion-reduce:animate-none" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActualsDriftSummaryRail({ summary }: { summary: AllocationActualsDriftSummary }) {
  const metrics = [
    { label: 'drifted', value: summary.drifted_company_count },
    { label: 'material', value: summary.material_company_count },
    { label: 'degraded', value: summary.degraded_company_count },
  ];
  const noDriftDisclosed =
    summary.facts_status === 'available' && metrics.every((metric) => metric.value === 0);

  return (
    <section
      aria-label="Actuals drift summary"
      className="border-y border-beige-200 bg-white px-4 py-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="font-medium text-pov-charcoal">
          {summary.facts_status === 'failed'
            ? 'Facts unavailable'
            : noDriftDisclosed
              ? 'No drift disclosed'
              : 'Actuals drift disclosure'}
        </p>
        <p className="text-xs tabular-nums text-charcoal-500">As of {summary.as_of_date}</p>
      </div>
      {summary.facts_status === 'failed' ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-charcoal-500">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full border border-charcoal-400 bg-transparent"
          />
          <span>Facts unavailable; company plan values remain visible.</span>
        </p>
      ) : null}
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center gap-1.5 text-sm text-charcoal-500">
            {metric.value > 0 ? (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
            ) : null}
            <span className="tabular-nums text-pov-charcoal">
              {metric.value} {metric.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AllocationsTab() {
  const { toast } = useToast();
  const { fundId } = useFundContext();
  const planningFmvEnabled = useFlag('enable_planning_fmv_overrides');
  // Generated-registry flag (not in ALL_FLAGS): resolve via the flag adapter,
  // matching the scenario workspace's own gate for the same feature.
  const seedPickerEnabled = useFeatureFlag('enable_scenario_seed_picker');
  const { data, isLoading, error, refetch } = useLatestAllocations();
  const {
    data: scenarioListData,
    isLoading: isScenarioListLoading,
    error: scenarioListError,
  } = useAllocationScenarioList();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedFmvCompanyId, setSelectedFmvCompanyId] = useState<number | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFmvDialogOpen, setIsFmvDialogOpen] = useState(false);
  const [isAddCompanyDialogOpen, setIsAddCompanyDialogOpen] = useState(false);
  const [expandedActualsCompanyIds, setExpandedActualsCompanyIds] = useState<Set<number>>(
    () => new Set()
  );
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
  const [selectedDecisionCompanyId, setSelectedDecisionCompanyId] = useState<number | null>(null);
  const [decisionType, setDecisionType] = useState<ReserveIcDecision['decisionType']>('follow_on');
  const [decisionStatus, setDecisionStatus] =
    useState<ReserveIcDecision['decisionStatus']>('draft');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decisionProposedCents, setDecisionProposedCents] = useState('');
  const [decisionFinalCents, setDecisionFinalCents] = useState('');
  const [applyPreview, setApplyPreview] = useState<AllocationScenarioApplyPreview | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AllocationCompany;
    direction: 'asc' | 'desc';
  } | null>(null);

  const scenarios = scenarioListData?.scenarios ?? [];
  const activeScenarioDetail = useAllocationScenarioDetail(activeScenarioId, {
    enabled: !!activeScenarioId && !workspaceDirty,
  });
  const reserveIcDecisionsQuery = useAllocationScenarioDecisions(activeScenarioId, {
    enabled: !!activeScenarioId,
  });
  const createScenarioMutation = useCreateAllocationScenario();
  const createReserveIcDecisionMutation = useCreateReserveIcDecision(activeScenarioId);
  const updateScenarioMutation = useUpdateAllocationScenario(activeScenarioId);
  const updateReserveIcDecisionMutation = useUpdateReserveIcDecision(activeScenarioId);
  const previewApplyMutation = useAllocationScenarioApplyPreview(activeScenarioId);
  const syncScenarioMutation = useSyncAllocationScenario(activeScenarioId);
  const applyScenarioMutation = useApplyAllocationScenario(activeScenarioId);
  const { publishedResultsQuery, comparisonQuery } = useReserveIcPacketEvidence(!!activeScenarioId);
  const latestPlanningFmvQuery = useLatestPlanningFmvOverrides({ enabled: planningFmvEnabled });

  const liveCompanies = useMemo(() => data?.companies ?? [], [data?.companies]);
  const displayedCompanies = workspaceCompanies.length > 0 ? workspaceCompanies : liveCompanies;
  const missingAllocationFactsCount = useMemo(
    () => displayedCompanies.filter((company) => Boolean(company.allocation_facts_missing)).length,
    [displayedCompanies]
  );
  const activeScenarioSummary =
    activeScenarioDetail.data ??
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    null;
  const activeScenarioContext: AllocationScenarioCollaborationContext | null =
    activeScenarioDetail.data?.context ?? null;
  const reserveIcDecisions = reserveIcDecisionsQuery.data?.decisions ?? EMPTY_RESERVE_IC_DECISIONS;
  const isScenarioPending =
    createScenarioMutation.isPending ||
    createReserveIcDecisionMutation.isPending ||
    updateScenarioMutation.isPending ||
    updateReserveIcDecisionMutation.isPending ||
    previewApplyMutation.isPending ||
    syncScenarioMutation.isPending ||
    applyScenarioMutation.isPending;

  useEffect(() => {
    setExpandedActualsCompanyIds(new Set());
  }, [fundId]);

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

  useEffect(() => {
    if (!activeScenarioId || displayedCompanies.length === 0) {
      setSelectedDecisionCompanyId(null);
      return;
    }

    setSelectedDecisionCompanyId((current) => {
      if (current && displayedCompanies.some((company) => company.company_id === current)) {
        return current;
      }

      return displayedCompanies[0]!.company_id;
    });
  }, [activeScenarioId, displayedCompanies]);

  const selectedCompany = useMemo(
    () => displayedCompanies.find((company) => company.company_id === selectedCompanyId) ?? null,
    [displayedCompanies, selectedCompanyId]
  );

  const planningFmvByCompanyId = useMemo(() => {
    const marks = latestPlanningFmvQuery.data?.marks ?? [];
    return new Map<number, PlanningFmvOverrideRecord>(marks.map((mark) => [mark.companyId, mark]));
  }, [latestPlanningFmvQuery.data?.marks]);

  const selectedFmvCompany = useMemo(
    () => displayedCompanies.find((company) => company.company_id === selectedFmvCompanyId) ?? null,
    [displayedCompanies, selectedFmvCompanyId]
  );

  const selectedFmvMark = selectedFmvCompany
    ? (planningFmvByCompanyId.get(selectedFmvCompany.company_id) ?? null)
    : null;

  const selectedDecisionCompany = useMemo(
    () =>
      displayedCompanies.find((company) => company.company_id === selectedDecisionCompanyId) ??
      null,
    [displayedCompanies, selectedDecisionCompanyId]
  );

  const selectedDecisionRecord = useMemo(
    () =>
      reserveIcDecisions.find((decision) => decision.companyId === selectedDecisionCompanyId) ??
      null,
    [reserveIcDecisions, selectedDecisionCompanyId]
  );

  useEffect(() => {
    if (!activeScenarioId || !selectedDecisionCompany) {
      setDecisionType('follow_on');
      setDecisionStatus('draft');
      setDecisionRationale('');
      setDecisionProposedCents('');
      setDecisionFinalCents('');
      return;
    }

    setDecisionType(selectedDecisionRecord?.decisionType ?? 'follow_on');
    setDecisionStatus(selectedDecisionRecord?.decisionStatus ?? 'draft');
    setDecisionRationale(
      selectedDecisionRecord?.rationale ?? selectedDecisionCompany.allocation_reason ?? ''
    );
    setDecisionProposedCents(
      toOptionalIntegerInput(
        selectedDecisionRecord?.proposedPlannedReservesCents ??
          selectedDecisionCompany.planned_reserves_cents
      )
    );
    setDecisionFinalCents(
      toOptionalIntegerInput(selectedDecisionRecord?.finalPlannedReservesCents ?? null)
    );
  }, [activeScenarioId, selectedDecisionCompany, selectedDecisionRecord]);

  const handleEdit = useCallback((company: AllocationCompany) => {
    setSelectedCompanyId(company.company_id);
    setIsEditDialogOpen(true);
  }, []);

  const handleToggleActualsDisclosure = useCallback((companyId: number) => {
    setExpandedActualsCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  }, []);

  const handleFmvOverride = useCallback((company: AllocationCompany) => {
    setSelectedFmvCompanyId(company.company_id);
    setIsFmvDialogOpen(true);
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

  const columns = useMemo(() => {
    const baseColumns = createAllocationsColumns(handleEdit, {
      expandedCompanyIds: expandedActualsCompanyIds,
      onToggle: handleToggleActualsDisclosure,
    });
    if (!planningFmvEnabled) {
      return baseColumns;
    }

    const currentFmvColumn: ColumnDef<AllocationCompany> = {
      id: 'current_fmv',
      header: 'Current FMV',
      cell: ({ row }) => {
        const mark = planningFmvByCompanyId.get(row.original.company_id);
        return (
          <div className="min-w-[150px] space-y-2">
            <div>
              <div className="text-right font-medium text-pov-charcoal">
                {formatPlanningFmvValue(mark?.fairValue)}
              </div>
              <div className="text-right text-xs text-charcoal-500">
                {mark?.markDate ?? 'No mark date'}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full"
              onClick={() => handleFmvOverride(row.original)}
            >
              <Banknote className="mr-1 h-4 w-4" />
              Save approved mark
            </Button>
          </div>
        );
      },
    };

    const actionColumn = baseColumns.at(-1);
    const leadingColumns = actionColumn ? baseColumns.slice(0, -1) : baseColumns;
    return actionColumn
      ? [...leadingColumns, currentFmvColumn, actionColumn]
      : [...leadingColumns, currentFmvColumn];
  }, [
    expandedActualsCompanyIds,
    handleEdit,
    handleFmvOverride,
    handleToggleActualsDisclosure,
    planningFmvByCompanyId,
    planningFmvEnabled,
  ]);

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
    setSelectedFmvCompanyId(null);
  }, [liveCompanies]);

  const handleResumeScenario = useCallback((scenarioId: string) => {
    setActiveScenarioId(scenarioId);
    setWorkspaceDirty(false);
    setWorkspaceSourceLabel('Loading scenario...');
    setScenarioActionNote('');
    setApplyPreview(null);
    setSelectedCompanyId(null);
    setSelectedFmvCompanyId(null);
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

  const handleSaveReserveDecision = useCallback(async () => {
    if (!activeScenarioId || !fundId || !selectedDecisionCompany) {
      return;
    }

    if (workspaceDirty) {
      toast({
        title: 'Save scenario changes first',
        description: 'Save or discard local edits before saving Reserve IC decisions.',
        variant: 'destructive',
      });
      return;
    }

    const trimmedRationale = decisionRationale.trim();
    if (!trimmedRationale) {
      toast({
        title: 'Decision rationale required',
        description: 'Add a rationale before saving the Reserve IC decision.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const proposedPlannedReservesCents = parseOptionalNonNegativeInt(decisionProposedCents);
      const finalPlannedReservesCents = parseOptionalNonNegativeInt(decisionFinalCents);
      const provenance = {
        sourceScenarioId: activeScenarioId,
        sourceAllocationVersion: activeScenarioSummary?.source_allocation_version ?? null,
        liveAllocationVersion: selectedDecisionCompany.allocation_version ?? null,
      };

      if (selectedDecisionRecord) {
        await updateReserveIcDecisionMutation.mutateAsync({
          decisionId: selectedDecisionRecord.id,
          payload: {
            decisionType,
            decisionStatus,
            rationale: trimmedRationale,
            proposedPlannedReservesCents,
            finalPlannedReservesCents,
            provenance,
          },
        });

        toast({
          title: 'Decision updated',
          description: `${selectedDecisionCompany.company_name} now reflects the latest IC decision.`,
        });
        return;
      }

      await createReserveIcDecisionMutation.mutateAsync({
        fundId,
        companyId: selectedDecisionCompany.company_id,
        decisionType,
        decisionStatus,
        rationale: trimmedRationale,
        proposedPlannedReservesCents,
        finalPlannedReservesCents,
        provenance,
      });

      toast({
        title: 'Decision recorded',
        description: `${selectedDecisionCompany.company_name} now has a saved Reserve IC decision.`,
      });
    } catch (mutationError) {
      toast({
        title: 'Decision save failed',
        description:
          mutationError instanceof Error
            ? mutationError.message
            : 'Failed to save Reserve IC decision',
        variant: 'destructive',
      });
    }
  }, [
    activeScenarioId,
    activeScenarioSummary?.source_allocation_version,
    createReserveIcDecisionMutation,
    decisionFinalCents,
    decisionProposedCents,
    decisionRationale,
    decisionStatus,
    decisionType,
    fundId,
    selectedDecisionCompany,
    selectedDecisionRecord,
    toast,
    updateReserveIcDecisionMutation,
    workspaceDirty,
  ]);

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
        hydrateScenarioWorkspace(
          liveCompanies.length > 0 ? liveCompanies : current,
          result.scenario
        )
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
  }, [
    activeScenarioId,
    liveCompanies,
    scenarioActionNote,
    syncScenarioMutation,
    toast,
    workspaceDirty,
  ]);

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
        hydrateScenarioWorkspace(
          liveCompanies.length > 0 ? liveCompanies : current,
          result.scenario
        )
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

  const reserveIcPacket = useMemo(() => {
    if (!activeScenarioDetail.data || !data) {
      return null;
    }

    return buildReserveIcPacket({
      liveAllocations: data,
      scenario: activeScenarioDetail.data,
      publishedResults: publishedResultsQuery.data ?? null,
      comparison: comparisonQuery.data ?? null,
      decisions: reserveIcDecisions,
    });
  }, [
    activeScenarioDetail.data,
    comparisonQuery.data,
    data,
    publishedResultsQuery.data,
    reserveIcDecisions,
  ]);

  const reserveIcPacketError = useMemo(() => {
    if (publishedResultsQuery.error instanceof Error) {
      return publishedResultsQuery.error;
    }
    if (comparisonQuery.error instanceof Error) {
      return comparisonQuery.error;
    }
    if (reserveIcDecisionsQuery.error instanceof Error) {
      return reserveIcDecisionsQuery.error;
    }
    return null;
  }, [comparisonQuery.error, publishedResultsQuery.error, reserveIcDecisionsQuery.error]);

  const combinedError = error || activeScenarioDetail.error || scenarioListError;
  if (combinedError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          We could not load reserve allocations. Retry in a moment or check that this fund is still
          available.
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <ActualsDriftSummarySkeleton />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (displayedCompanies.length === 0) {
    return (
      <>
        {data?.metadata.actuals_drift_summary ? (
          <ActualsDriftSummaryRail summary={data.metadata.actuals_drift_summary} />
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Company Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="mx-auto flex max-w-md flex-col items-center py-12 text-center text-charcoal-600"
              data-testid="reserve-planning-empty-state"
            >
              <div className="mb-4 rounded-full bg-pov-gray p-3">
                <Plus className="h-5 w-5 text-charcoal-700" />
              </div>
              <p className="mb-2 text-lg font-medium text-pov-charcoal">
                No portfolio companies found
              </p>
              <p className="text-sm">
                Add a company to this fund before creating reserve allocations and IC decisions.
              </p>
              <Button
                className="mt-5"
                disabled={!fundId}
                onClick={() => setIsAddCompanyDialogOpen(true)}
                data-testid="reserve-planning-add-company-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
              {!fundId ? (
                <p className="mt-2 text-xs text-charcoal-500">
                  Select a fund before adding portfolio companies.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
        {fundId ? (
          <AddCompanyDialog
            fundId={fundId}
            open={isAddCompanyDialogOpen}
            onOpenChange={setIsAddCompanyDialogOpen}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-pov-charcoal">Company Allocations</h2>
          <p className="text-sm text-charcoal-500 mt-1">
            Manage reserve allocations for {displayedCompanies.length} companies
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {missingAllocationFactsCount > 0 ? (
        <Alert className="border-warning/30 bg-warning/10 text-warning-dark">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Allocation facts are missing for {missingAllocationFactsCount}{' '}
            {missingAllocationFactsCount === 1 ? 'company' : 'companies'}. Rows remain visible with
            missing reserve values until allocation facts are recorded.
          </AlertDescription>
        </Alert>
      ) : null}

      {data?.metadata.actuals_drift_summary ? (
        <ActualsDriftSummaryRail summary={data.metadata.actuals_drift_summary} />
      ) : null}

      <Card className="border-presson-info/20 bg-presson-info/10">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-lg text-presson-info">
                Reserve Planning Workspace
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{workspaceSourceLabel}</Badge>
                {workspaceDirty ? (
                  <Badge variant="outline" className="border-warning/30 text-warning-dark">
                    Unsaved local edits
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-presson-info/20 text-presson-info">
                  {activeScenarioId
                    ? `Last modified ${activeScenarioLastModifiedLabel}`
                    : `Last synced ${lastUpdatedLabel}`}
                </Badge>
                {activeScenarioId ? (
                  <>
                    <Badge variant="outline" className="border-presson-info/20 text-presson-info">
                      {activeScenarioLastSyncedLabel}
                    </Badge>
                    <Badge variant="outline" className="border-presson-info/20 text-presson-info">
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
                  <div className="rounded-md border border-presson-info/20 bg-white/70 px-3 py-2 text-sm text-presson-info">
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
                <div className="space-y-4 rounded-lg border border-presson-info/20 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-presson-info">
                        Live Sync and Apply
                      </div>
                      <div className="text-xs text-presson-info/80">
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
                        Save or discard local scenario edits before syncing from live or applying to
                        the live allocation surface.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {applyPreview ? (
                    <div className="space-y-4 rounded-lg border border-presson-info/20 bg-presson-info/10 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-presson-info">Apply Preview</div>
                          <div className="text-xs text-presson-info/90">
                            {getApplyPreviewDescription(applyPreview)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="border-presson-info/30 text-presson-info"
                          >
                            {getDriftStatusBadgeLabel(applyPreview)}
                          </Badge>
                          <Badge variant="secondary">{getApplyStateBadgeLabel(applyPreview)}</Badge>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Companies Changed
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {applyPreview.summary.companies_changed}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Companies Unchanged
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {applyPreview.summary.companies_unchanged}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Planned Delta
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {formatDeltaLabel(applyPreview.summary.total_planned_delta_cents)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Scenario-only Companies
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {applyPreview.summary.scenario_only_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Live-only Companies
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {applyPreview.summary.live_only_count}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-presson-info/70">
                            Live Allocation Version
                          </div>
                          <div className="mt-1 text-lg font-semibold text-presson-info">
                            {applyPreview.live.max_allocation_version !== null
                              ? `v${applyPreview.live.max_allocation_version}`
                              : 'No live version'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-xs text-presson-info/80">
                          Live snapshot:{' '}
                          {formatDateLabel(
                            applyPreview.live.last_updated_at,
                            'Live allocations have not been updated yet'
                          )}
                        </div>
                        <Button
                          onClick={handleApplyScenario}
                          disabled={
                            applyPreview.apply_state === 'blocked' ||
                            applyScenarioMutation.isPending
                          }
                        >
                          {applyScenarioMutation.isPending ? 'Applying...' : 'Confirm Apply'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-presson-info/80">
                      Preview apply to compute drift against the current live allocation surface
                      before confirming.
                    </p>
                  )}
                </div>
              ) : null}

              <div className="space-y-4 rounded-lg border border-beige-200 bg-pov-gray/80 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-pov-charcoal">
                      Collaboration Context
                    </div>
                    <div className="text-xs text-charcoal-700/70">
                      Durable sync and apply history from the server. Scenario notes stay in the
                      editor above, while company-level reasons remain on each allocation row.
                    </div>
                  </div>
                  <Badge variant="outline" className="border-charcoal-300 text-charcoal-700">
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
                  <p className="text-sm text-charcoal-600">
                    Resume a saved scenario to view its durable sync and apply context here.
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-lg border border-beige-200 bg-pov-gray/80 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-pov-charcoal">
                      Reserve IC Decisions
                    </div>
                    <div className="text-xs text-charcoal-700/70">
                      Capture company-level follow-on, defer, cut-reserve, and no-action decisions
                      for the active scenario without changing live allocations.
                    </div>
                  </div>
                  <Badge variant="outline" className="border-charcoal-300 text-charcoal-700">
                    {activeScenarioId ? `${reserveIcDecisions.length} saved` : 'Select a scenario'}
                  </Badge>
                </div>

                {activeScenarioId && selectedDecisionCompany ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                    <div className="space-y-3 rounded-md border border-beige-200 bg-white/90 p-4">
                      <div className="grid gap-2">
                        <Label htmlFor="reserve-ic-company">Company</Label>
                        <select
                          id="reserve-ic-company"
                          value={selectedDecisionCompanyId ?? ''}
                          onChange={(event) =>
                            setSelectedDecisionCompanyId(Number(event.target.value))
                          }
                          className="px-3 py-2 border border-charcoal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pov-charcoal"
                        >
                          {displayedCompanies.map((company) => (
                            <option key={company.company_id} value={company.company_id}>
                              {company.company_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="reserve-ic-type">Decision Type</Label>
                          <select
                            id="reserve-ic-type"
                            value={decisionType}
                            onChange={(event) =>
                              setDecisionType(
                                event.target.value as ReserveIcDecision['decisionType']
                              )
                            }
                            className="px-3 py-2 border border-charcoal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pov-charcoal"
                          >
                            {RESERVE_IC_DECISION_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="reserve-ic-status">Decision Status</Label>
                          <select
                            id="reserve-ic-status"
                            value={decisionStatus}
                            onChange={(event) =>
                              setDecisionStatus(
                                event.target.value as ReserveIcDecision['decisionStatus']
                              )
                            }
                            className="px-3 py-2 border border-charcoal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pov-charcoal"
                          >
                            {RESERVE_IC_DECISION_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="reserve-ic-proposed">Proposed Reserve Cents</Label>
                          <Input
                            id="reserve-ic-proposed"
                            value={decisionProposedCents}
                            onChange={(event) => setDecisionProposedCents(event.target.value)}
                            inputMode="numeric"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="reserve-ic-final">Final Reserve Cents</Label>
                          <Input
                            id="reserve-ic-final"
                            value={decisionFinalCents}
                            onChange={(event) => setDecisionFinalCents(event.target.value)}
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="reserve-ic-rationale">Decision Rationale</Label>
                        <Textarea
                          id="reserve-ic-rationale"
                          value={decisionRationale}
                          onChange={(event) => setDecisionRationale(event.target.value)}
                          rows={4}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-charcoal-600">
                        <Badge variant="outline" className="border-charcoal-300 text-charcoal-700">
                          Live planned{' '}
                          {formatCents(selectedDecisionCompany.planned_reserves_cents, {
                            compact: true,
                          })}
                        </Badge>
                        {selectedDecisionRecord ? (
                          <Badge
                            variant="outline"
                            className="border-charcoal-300 text-charcoal-700"
                          >
                            Existing{' '}
                            {formatDecisionStatusLabel(selectedDecisionRecord.decisionStatus)}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-charcoal-300 text-charcoal-700"
                          >
                            New decision
                          </Badge>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveReserveDecision}
                          disabled={workspaceDirty || isScenarioPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {selectedDecisionRecord ? 'Update Decision' : 'Save Decision'}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-md border border-beige-200 bg-white/90 p-4">
                      <div className="text-sm font-medium text-pov-charcoal">Decision Snapshot</div>
                      <div className="mt-3 space-y-3 text-sm text-charcoal-700">
                        <div>
                          <span className="font-medium text-pov-charcoal">Company:</span>{' '}
                          {selectedDecisionCompany.company_name}
                        </div>
                        <div>
                          <span className="font-medium text-pov-charcoal">Type:</span>{' '}
                          {formatDecisionTypeLabel(decisionType)}
                        </div>
                        <div>
                          <span className="font-medium text-pov-charcoal">Status:</span>{' '}
                          {formatDecisionStatusLabel(decisionStatus)}
                        </div>
                        <div>
                          <span className="font-medium text-pov-charcoal">Proposed:</span>{' '}
                          {formatOptionalDecisionCents(decisionProposedCents)}
                        </div>
                        <div>
                          <span className="font-medium text-pov-charcoal">Final:</span>{' '}
                          {formatOptionalDecisionCents(decisionFinalCents)}
                        </div>
                        <div className="rounded-md border border-beige-200 bg-pov-gray/80 px-3 py-2">
                          {decisionRationale.trim() || 'No decision rationale recorded yet.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-charcoal-600">
                    Resume a saved scenario to capture or review Reserve IC decisions.
                  </p>
                )}
              </div>

              <ReserveIcPacketCard
                packet={reserveIcPacket}
                isLoading={
                  !!activeScenarioId &&
                  (publishedResultsQuery.isLoading ||
                    comparisonQuery.isLoading ||
                    reserveIcDecisionsQuery.isLoading)
                }
                error={reserveIcPacketError}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-presson-info/80">Companies with plans</div>
                  <div className="text-2xl font-semibold text-presson-info mt-1">
                    {reservePlanCount}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-presson-info/80">Documented notes</div>
                  <div className="text-2xl font-semibold text-presson-info mt-1">
                    {documentedPlanCount}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-presson-info/80">Total planned</div>
                  <div className="text-2xl font-semibold text-presson-info mt-1">
                    {formatCents(workspaceTotals.total_planned_cents, { compact: true })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-presson-info/20 bg-white/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-presson-info">Saved Scenarios</div>
                  <div className="text-xs text-presson-info/80">
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
                  <p className="text-sm text-presson-info/80">
                    Save the current workspace to create the first durable scenario.
                  </p>
                ) : (
                  scenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className={`rounded-md border p-3 ${
                        scenario.id === activeScenarioId
                          ? 'border-pov-charcoal bg-pov-gray'
                          : 'border-presson-info/20 bg-white/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium text-pov-charcoal">{scenario.name}</div>
                          <div className="text-xs text-charcoal-500">
                            Last modified {formatDateLabel(scenario.updated_at, 'Not yet saved')}
                          </div>
                          <div className="text-xs text-charcoal-500">
                            {scenario.company_count} companies ·{' '}
                            {formatCents(scenario.total_planned_cents, { compact: true })}
                          </div>
                          <div className="text-xs text-charcoal-500">
                            {formatActionStatusLabel(
                              'Synced',
                              scenario.last_synced_at,
                              scenario.last_synced_by,
                              'Not synced from live'
                            )}
                          </div>
                          <div className="text-xs text-charcoal-500">
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
                      <p className="mt-2 text-sm text-charcoal-600">
                        {scenario.notes?.trim() || 'No notes'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <p className="text-sm text-presson-info/90">
            Saved scenarios snapshot the current workspace. Resumed scenarios stay local until you
            save them again.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-charcoal-500">Total Planned Reserves</div>
            <div className="text-2xl font-bold text-presson-info mt-1">
              {formatCents(workspaceTotals.total_planned_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-charcoal-500">Total Deployed Reserves</div>
            <div className="text-2xl font-bold text-presson-info mt-1">
              {formatCents(workspaceTotals.total_deployed_cents, { compact: true })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-charcoal-500">Remaining to Deploy</div>
            <div className="text-2xl font-bold text-presson-positive mt-1">
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-charcoal-400" />
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
          className="px-3 py-2 border border-charcoal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pov-charcoal"
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
          className="px-3 py-2 border border-charcoal-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pov-charcoal"
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

      {planningFmvEnabled && latestPlanningFmvQuery.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {latestPlanningFmvQuery.error instanceof Error
              ? latestPlanningFmvQuery.error.message
              : 'Failed to load Planning FMV marks'}
          </AlertDescription>
        </Alert>
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
                    className="text-center py-8 text-charcoal-500"
                  >
                    No companies match your filters
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedCompanies.map((company) => (
                  <Fragment key={company.company_id}>
                    <TableRow>
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
                    <TableRow
                      className={
                        expandedActualsCompanyIds.has(company.company_id)
                          ? 'border-0 hover:bg-transparent'
                          : 'hidden'
                      }
                    >
                      <TableCell colSpan={enrichedColumns.length} className="p-0">
                        <div
                          id={`allocation-actuals-disclosure-${company.company_id}`}
                          aria-hidden={!expandedActualsCompanyIds.has(company.company_id)}
                        >
                          {expandedActualsCompanyIds.has(company.company_id) ? (
                            <>
                              <AllocationActualsDisclosure
                                drift={company.actuals_drift}
                                companyName={company.company_name}
                              />
                              {/* Plan 9 Wave 9B1: scenario seed deep link lives
                                  INSIDE the expanded disclosure only (collapsed
                                  rows stay chrome-free); flag-off renders
                                  disabled with reason (D-C). */}
                              <div className="border-t border-beige-200 bg-white px-4 py-2 text-sm">
                                {seedPickerEnabled && fundId ? (
                                  <Link
                                    href={`/fund-model-results/${fundId}/scenarios?seedPicker=1&seedCompany=${company.company_id}`}
                                    data-testid={`allocation-seed-link-${company.company_id}`}
                                    className="text-pov-charcoal underline underline-offset-4"
                                  >
                                    Start scenario from this company&apos;s actuals
                                  </Link>
                                ) : (
                                  <span
                                    aria-disabled="true"
                                    data-testid={`allocation-seed-link-${company.company_id}-disabled`}
                                    className="text-presson-textMuted"
                                  >
                                    Start scenario from this company&apos;s actuals —{' '}
                                    {fundId
                                      ? 'the scenario seed picker is not enabled'
                                      : 'select a fund first'}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
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
      <FmvOverrideDialog
        company={selectedFmvCompany}
        currentMark={selectedFmvMark}
        open={isFmvDialogOpen}
        onOpenChange={setIsFmvDialogOpen}
        scenarioActive={!!activeScenarioId}
      />
    </div>
  );
}
