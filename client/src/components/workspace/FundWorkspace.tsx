import React from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { fetchFundSummaries, FUNDS_QUERY_KEY, type Fund } from '@/lib/funds-query';
import { apiRequest, ApiError } from '@/lib/queryClient';
import { buildDashboardHref, type FundIdParam } from '@/lib/fund-routes';
import { formatUSDShort } from '@/lib/formatting';
import { hasFundWorkspaceSession, prepareFundCommand, fundStore } from '@/stores/fundStore';
import { useFundSelector, useFundTuple } from '@/stores/useFundSelector';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { saveFundDraft } from '@/services/fund-drafts';
import { classifyWorkflowError } from '@/services/fund-workflow';
import { useFlag } from '@/hooks/useUnifiedFlag';
import { PARTNER_WRITE_ROLES, effectiveRoleOf } from '@shared/auth/effective-roles';
import {
  FundStateReadV1Schema,
  type FundStateReadV1,
} from '@shared/contracts/fund-state-read-v1.contract';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const FUND_STATE_QUERY_KEY = 'fund-state';

async function fetchFundState(fundId: number): Promise<FundStateReadV1> {
  return FundStateReadV1Schema.parse(
    await apiRequest<unknown>('GET', `/api/funds/${fundId}/state`)
  );
}

type LifecycleRead =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'state'; state: FundStateReadV1 };

const CALCULATION_COPY: Record<FundStateReadV1['calculationState']['status'], string> = {
  not_requested: 'Calculations not requested',
  submitted: 'Calculations pending',
  calculating: 'Calculating',
  ready: 'Results ready',
  failed: 'Calculation failed',
};

function lifecycleLabel(read: LifecycleRead): string {
  if (read.kind === 'loading') return 'Checking status';
  if (read.kind === 'unavailable') return read.reason;
  const { hasDraft, hasPublished } = read.state.configState;
  if (hasDraft && hasPublished) return 'Published; draft changes available';
  if (hasPublished) return 'Published';
  if (hasDraft) return 'Draft';
  return 'No saved configuration';
}

function unavailableReason(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sign in to see status';
    if (error.status === 403) return 'Status unavailable for your role';
    if (error.status === 404) return 'Fund unavailable';
  }
  return 'Status unavailable';
}

function lastUpdated(fund: Fund, read: LifecycleRead): string {
  const config = read.kind === 'state' ? read.state.configState : null;
  const iso =
    config?.draftUpdatedAt ??
    config?.publishedUpdatedAt ??
    config?.publishedAt ??
    fund.updatedAt ??
    null;
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface FundRowProps {
  fund: Fund;
  read: LifecycleRead;
  canWrite: boolean;
  selected: boolean;
  onRetry: () => void;
}

function FundRow({ fund, read, canWrite, selected, onRetry }: FundRowProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const hasPublished = read.kind === 'state' && read.state.configState.hasPublished;
  const hasDraft = read.kind === 'state' && read.state.configState.hasDraft;
  const calculation = read.kind === 'state' ? read.state.calculationState.status : null;

  return (
    <TableRow
      data-testid={`workspace-fund-${fund.id}`}
      data-state={selected ? 'selected' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <TableCell className="font-medium text-presson-text">
        <span className="block whitespace-normal break-words">{fund.name}</span>
        <span className="mt-1 block text-xs tabular-nums text-presson-textMuted md:hidden">
          {fund.vintageYear} · {formatUSDShort(fund.size)}
        </span>
      </TableCell>
      <TableCell className="hidden tabular-nums md:table-cell">{fund.vintageYear}</TableCell>
      <TableCell className="hidden tabular-nums md:table-cell">
        {formatUSDShort(fund.size)}
      </TableCell>
      <TableCell className="hidden tabular-nums text-presson-textMuted lg:table-cell">
        {lastUpdated(fund, read)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="whitespace-normal font-normal">
          {lifecycleLabel(read)}
        </Badge>
        {calculation && (
          <span className="mt-1 block text-xs text-presson-textMuted">
            {CALCULATION_COPY[calculation]}
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          {read.kind === 'unavailable' && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry status
            </Button>
          )}
          {hasPublished && (
            <Button
              type="button"
              size="sm"
              className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
              onClick={() => navigate(`/fund-model-results/${fund.id}`)}
            >
              Open model
            </Button>
          )}
          {hasDraft && canWrite && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigate(`/fund-setup?fundId=${fund.id}&step=1`)}
            >
              Resume Draft
            </Button>
          )}
          {hasPublished && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => navigate(buildDashboardHref('overview', fund.id, search))}
            >
              Analytics
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface NewFundDialogProps {
  open: boolean;
  fundName: string;
  canSave: boolean;
  saving: boolean;
  blocked: boolean;
  error: string | null;
  onKeepEditing: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

function NewFundDialog(props: NewFundDialogProps) {
  const { open, fundName, canSave, saving, blocked, error, onKeepEditing, onConfirm, onClose } =
    props;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby="new-fund-dialog-description">
        <DialogHeader>
          <DialogTitle>Start another fund?</DialogTitle>
          <DialogDescription id="new-fund-dialog-description">
            {blocked
              ? 'Check the pending command status before starting another fund.'
              : canSave
                ? `Save changes to ${fundName} before starting a separate fund.`
                : `${fundName} has not been saved to the server yet. Starting a separate fund discards its local values.`}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-error-dark">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onKeepEditing} disabled={saving}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant={canSave ? 'default' : 'outline'}
            className={
              canSave
                ? 'bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90'
                : 'border-error-dark text-error-dark hover:bg-error/10'
            }
            onClick={onConfirm}
            disabled={saving || blocked}
          >
            {saving
              ? 'Saving draft…'
              : canSave
                ? 'Save draft and start new'
                : 'Discard and start new'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface FundWorkspaceProps {
  selection: FundIdParam;
}

export function FundWorkspace({ selection }: FundWorkspaceProps) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const economicsEnabled = useFlag('enable_gp_economics_engine', { withDependencies: true });
  const [draftFundId, draftServerReady, draftSyncStatus, localFundName, actorRole, pendingCommand] =
    useFundTuple(
      (s) =>
        [
          s.draftFundId,
          s.draftServerReady,
          s.draftSyncStatus,
          s.fundName,
          s.workspaceActorRole,
          s.pendingCommand,
        ] as const
    );
  const hasLocalSession = useFundSelector(hasFundWorkspaceSession);
  // Early guidance only; the server checks permission on every create, save and publish.
  const role = effectiveRoleOf(actorRole);
  const canWrite = role != null && (PARTNER_WRITE_ROLES as readonly string[]).includes(role);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogSaving, setDialogSaving] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const fundsQuery = useQuery<Fund[]>({ queryKey: FUNDS_QUERY_KEY, queryFn: fetchFundSummaries });
  const funds = React.useMemo(() => fundsQuery.data ?? [], [fundsQuery.data]);
  const stateQueries = useQueries({
    queries: funds.map((fund) => ({
      queryKey: [FUND_STATE_QUERY_KEY, fund.id],
      queryFn: () => fetchFundState(fund.id),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const selectedFundId = selection.kind === 'valid' ? selection.id : null;
  const selectedFund = funds.find((fund) => fund.id === selectedFundId) ?? null;
  const selectionUnavailable =
    selection.kind === 'invalid' ||
    (selection.kind === 'valid' && fundsQuery.isSuccess && !selectedFund);
  const localSessionName = localFundName?.trim() || 'the current draft';
  // Only a confirmed save is settled; 'idle' after reload can hold unsaved restored edits.
  const localSettled = !pendingCommand && draftSyncStatus === 'synced';
  const blockedCommand = pendingCommand != null && pendingCommand.operation !== 'save_draft';

  const startNewFund = React.useCallback(() => {
    fundStore.getState().startNewFundSession();
    navigate('/fund-setup?step=1');
  }, [navigate]);

  const handleNewFund = React.useCallback(() => {
    if (!hasLocalSession || (draftFundId != null && draftServerReady && localSettled)) {
      startNewFund();
      return;
    }
    setDialogError(null);
    setDialogOpen(true);
  }, [draftFundId, draftServerReady, hasLocalSession, localSettled, startNewFund]);

  const canSaveLocalDraft = draftFundId != null;

  const confirmNewFund = React.useCallback(async () => {
    if (blockedCommand) return;
    if (!canSaveLocalDraft) {
      startNewFund();
      return;
    }
    const state = fundStore.getState();
    const targetFundId = state.draftFundId;
    if (targetFundId == null) {
      startNewFund();
      return;
    }
    const payload = fundStoreToDraftWriteV1(state, {
      includeEconomicsAssumptions: economicsEnabled,
    });
    let command;
    try {
      command = prepareFundCommand('save_draft', targetFundId, payload, state.draftETag);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Could not prepare draft save');
      return;
    }
    const stillCurrent = () =>
      fundStore.getState().sessionId === state.sessionId &&
      fundStore.getState().pendingCommand?.key === command.key;
    setDialogSaving(true);
    setDialogError(null);
    try {
      const saved = await saveFundDraft(targetFundId, command.payload, {
        key: command.key,
        etag: command.etag,
      });
      if (!stillCurrent()) return;
      const current = fundStore.getState();
      current.setDraftETag(saved.etag ?? current.draftETag);
      current.setDraftServerReady(true);
      current.resolveCommand();
      if (
        JSON.stringify(
          fundStoreToDraftWriteV1(current, { includeEconomicsAssumptions: economicsEnabled })
        ) !== JSON.stringify(command.payload)
      ) {
        setDialogError(
          'The previous save is confirmed. Save the newer changes before starting another fund.'
        );
        return;
      }
      current.setDraftSyncStatus('synced');
      setDialogOpen(false);
      startNewFund();
    } catch (error) {
      if (!stillCurrent()) return;
      // A failed or uncertain save never resets state.
      if (classifyWorkflowError(error) === 'rejected') fundStore.getState().resolveCommand();
      setDialogError(
        classifyWorkflowError(error) === 'uncertain'
          ? 'Could not confirm the save; it may have completed. Keep editing to check.'
          : error instanceof Error
            ? error.message
            : 'Could not save changes'
      );
    } finally {
      setDialogSaving(false);
    }
  }, [blockedCommand, canSaveLocalDraft, economicsEnabled, startNewFund]);

  return (
    <div className="min-h-screen bg-pov-gray" data-testid="fund-workspace">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-inter text-2xl font-semibold text-presson-text text-balance">
              Fund workspace
            </h1>
            <p className="mt-1 text-sm text-presson-textMuted">
              Create a fund, resume construction, or open a model.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-56">
              <label htmlFor="workspace-fund-select" className="sr-only">
                Viewing fund
              </label>
              <Select
                value={selectedFund ? String(selectedFund.id) : ''}
                onValueChange={(value) => navigate(buildDashboardHref(null, Number(value), search))}
                disabled={funds.length === 0}
              >
                <SelectTrigger id="workspace-fund-select" aria-label="Viewing fund">
                  <SelectValue placeholder="Set active fund" />
                </SelectTrigger>
                <SelectContent>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={String(fund.id)}>
                      {fund.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canWrite && (
              <Button
                type="button"
                className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
                onClick={handleNewFund}
                data-testid="workspace-new-fund"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                New Fund
              </Button>
            )}
          </div>
        </header>

        {selectionUnavailable && (
          <Alert
            className="border-l-4 border-l-warning bg-warning/10"
            data-testid="workspace-selection-unavailable"
          >
            <AlertTitle>That fund selection is unavailable</AlertTitle>
            <AlertDescription>
              The fund in the address is not available to you. Choose a fund from the list.
            </AlertDescription>
          </Alert>
        )}

        {actorRole != null && !canWrite && (
          <p className="text-sm text-presson-textMuted" data-testid="workspace-read-only">
            Your role can open models; creating and editing drafts requires a partner or admin.
          </p>
        )}

        {draftFundId != null && canWrite && (
          <Alert
            className="border-presson-borderSubtle bg-pov-white"
            data-testid="workspace-resume-draft"
          >
            <AlertTitle>Draft in progress</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{localSessionName} can be resumed in this tab.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate('/fund-setup?step=1')}
              >
                Resume Draft
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {fundsQuery.isLoading ? (
          <p className="text-sm text-charcoal-600" data-testid="workspace-loading">
            Loading funds
          </p>
        ) : fundsQuery.isError ? (
          <Alert role="alert" className="border-l-4 border-l-error bg-error/10">
            <AlertTitle>Funds could not be loaded</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                {fundsQuery.error instanceof Error ? fundsQuery.error.message : 'Try again.'}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fundsQuery.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : funds.length === 0 ? (
          <div
            className="rounded-lg border border-presson-borderSubtle bg-pov-white p-6"
            data-testid="workspace-empty"
          >
            <p className="text-sm text-presson-text">No funds yet.</p>
            <p className="mt-1 text-sm text-presson-textMuted">
              {canWrite
                ? 'Start with New Fund to build your first model.'
                : 'No funds are shared with you.'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-presson-borderSubtle bg-pov-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead className="hidden md:table-cell">Vintage</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((fund, index) => {
                  const query = stateQueries[index];
                  const read: LifecycleRead =
                    !query || query.isPending
                      ? { kind: 'loading' }
                      : query.isError
                        ? { kind: 'unavailable', reason: unavailableReason(query.error) }
                        : { kind: 'state', state: query.data };
                  return (
                    <FundRow
                      key={fund.id}
                      fund={fund}
                      read={read}
                      canWrite={canWrite}
                      selected={fund.id === selectedFundId}
                      onRetry={() => void query?.refetch()}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NewFundDialog
        open={dialogOpen}
        fundName={localSessionName}
        canSave={canSaveLocalDraft}
        saving={dialogSaving}
        blocked={blockedCommand}
        error={dialogError}
        onKeepEditing={() => {
          setDialogOpen(false);
          navigate('/fund-setup?step=1');
        }}
        onConfirm={() => void confirmNewFund()}
        onClose={() => !dialogSaving && setDialogOpen(false)}
      />
    </div>
  );
}

export default FundWorkspace;
