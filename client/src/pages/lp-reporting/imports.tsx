import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  IMPORT_DATA_BASIS,
  type BulkResolveResponse,
  type ImportBatchStatusResponse,
  type ReconciliationCaseDto,
  type ResolveCaseRequest,
  type StageImportBatchReceipt,
} from '@shared/contracts/financial-observations/reconciliation-api.contract';
import { IMPORT_V2_CONTRACT_VERSION } from '@shared/contracts/financial-observations/normalization.contract';
import type { ReconciliationCanonicalRecordKind } from '@shared/contracts/financial-observations/reconciliation.contract';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { ImportPreviewPanel } from '@/components/lp-reporting/ImportPreviewPanel';
import { ImportWarningsList } from '@/components/lp-reporting/ImportWarningsList';
import { useFundContext } from '@/contexts/FundContext';
import {
  reconciliationErrorEnvelope,
  useBulkResolveReconciliationCases,
  useCommitImportBatch,
  useImportBatchStatus,
  useReconciliationCases,
  useResolveReconciliationCase,
  useStageImportBatch,
  type LpReportingHookError,
} from '@/hooks/lp-reporting';

type ResolutionAction = ResolveCaseRequest['action'];

interface StageFormState {
  sourceArtifactId: string;
  mappingProfileId: string;
}

interface DecisionDraft {
  action: ResolutionAction;
  memo: string;
  targetCompanyIdentityId: string;
  sourceCompanyIdentityId: string;
  canonicalName: string;
  targetCanonicalRecordKind: ReconciliationCanonicalRecordKind;
  targetCanonicalRecordId: string;
}

const EMPTY_STAGE_FORM: StageFormState = {
  sourceArtifactId: '',
  mappingProfileId: '',
};

const EMPTY_DECISION_DRAFT: DecisionDraft = {
  action: 'confirm_match',
  memo: '',
  targetCompanyIdentityId: '',
  sourceCompanyIdentityId: '',
  canonicalName: '',
  targetCanonicalRecordKind: 'cash_flow_event',
  targetCanonicalRecordId: '',
};

function positiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `import-v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function actionOptions(caseType: ReconciliationCaseDto['caseType']): ResolutionAction[] {
  if (caseType === 'observation_match') {
    return ['confirm_match', 'reject'];
  }
  return ['confirm_match', 'create_identity', 'merge_identities'];
}

function labelForAction(action: ResolutionAction): string {
  switch (action) {
    case 'confirm_match':
      return 'Confirm match';
    case 'create_identity':
      return 'Create identity';
    case 'merge_identities':
      return 'Merge identities';
    case 'reject':
      return 'Reject duplicate';
  }
}

function decisionFromDraft(
  selectedCase: ReconciliationCaseDto,
  draft: DecisionDraft
): ResolveCaseRequest | null {
  const memo = draft.memo.trim();
  if (!memo) {
    return null;
  }

  if (selectedCase.caseType === 'observation_match') {
    if (draft.action === 'reject') {
      return { action: 'reject', targetCompanyIdentityId: null, memo };
    }
    const targetId = positiveInt(draft.targetCanonicalRecordId);
    if (draft.action !== 'confirm_match' || targetId === null) {
      return null;
    }
    return {
      action: 'confirm_match',
      targetCompanyIdentityId: null,
      memo,
      targetCanonicalRecordRef: {
        kind: draft.targetCanonicalRecordKind,
        id: targetId,
      },
    };
  }

  if (draft.action === 'confirm_match') {
    const targetId = positiveInt(draft.targetCompanyIdentityId);
    return targetId === null
      ? null
      : { action: 'confirm_match', targetCompanyIdentityId: targetId, memo };
  }
  if (draft.action === 'create_identity') {
    const canonicalName = draft.canonicalName.trim();
    return canonicalName
      ? { action: 'create_identity', targetCompanyIdentityId: null, canonicalName, memo }
      : null;
  }
  if (draft.action === 'merge_identities') {
    const targetId = positiveInt(draft.targetCompanyIdentityId);
    const sourceId = positiveInt(draft.sourceCompanyIdentityId);
    return targetId === null || sourceId === null
      ? null
      : {
          action: 'merge_identities',
          targetCompanyIdentityId: targetId,
          sourceCompanyIdentityId: sourceId,
          memo,
        };
  }
  return null;
}

function errorCard(testId: string, err: LpReportingHookError | null) {
  if (!err) {
    return null;
  }
  const envelope = reconciliationErrorEnvelope(err);
  return (
    <Alert
      variant="destructive"
      data-testid={testId}
      data-error-status={envelope.status}
      data-error-code={err.code ?? ''}
    >
      <AlertTitle>{envelope.title}</AlertTitle>
      <AlertDescription>{envelope.description}</AlertDescription>
    </Alert>
  );
}

interface StagePanelProps {
  fundId: number | null;
  onStaged: (receipt: StageImportBatchReceipt) => void;
}

function StagePanel({ fundId, onStaged }: StagePanelProps) {
  const [form, setForm] = useState<StageFormState>(EMPTY_STAGE_FORM);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const stageMutation = useStageImportBatch({ fundId });
  const sourceArtifactId = positiveInt(form.sourceArtifactId);
  const mappingProfileId = positiveInt(form.mappingProfileId);
  const canStage =
    fundId !== null &&
    sourceArtifactId !== null &&
    mappingProfileId !== null &&
    !stageMutation.isPending;

  const handleStage = useCallback(async () => {
    if (sourceArtifactId === null || mappingProfileId === null) {
      return;
    }
    const receipt = await stageMutation.mutateAsync({
      idempotencyKey,
      body: {
        contractVersion: IMPORT_V2_CONTRACT_VERSION,
        sourceArtifactId,
        mappingProfileId,
        dataBasis: IMPORT_DATA_BASIS,
      },
    });
    onStaged(receipt);
    setIdempotencyKey(newIdempotencyKey());
  }, [idempotencyKey, mappingProfileId, onStaged, sourceArtifactId, stageMutation]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage CSV Evidence</CardTitle>
        <CardDescription>
          Use a stored CSV artifact and CSV mapping profile to stage observed actual evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorCard('imports-v2-stage-error', stageMutation.error)}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="imports-v2-source-artifact">CSV artifact ID</Label>
            <Input
              id="imports-v2-source-artifact"
              inputMode="numeric"
              value={form.sourceArtifactId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sourceArtifactId: event.target.value }))
              }
              data-testid="imports-v2-source-artifact-id"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imports-v2-mapping-profile">Mapping profile ID</Label>
            <Input
              id="imports-v2-mapping-profile"
              inputMode="numeric"
              value={form.mappingProfileId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, mappingProfileId: event.target.value }))
              }
              data-testid="imports-v2-mapping-profile-id"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void handleStage()}
            disabled={!canStage}
            data-testid="imports-v2-stage-button"
          >
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            {stageMutation.isPending ? 'Staging...' : 'Stage batch'}
          </Button>
          <span className="text-sm text-charcoal/70">
            Accepted evidence only. Not calculation-active.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface CasesPanelProps {
  fundId: number | null;
  batchId: number | null;
}

function CasesPanel({ fundId, batchId }: CasesPanelProps) {
  const casesQuery = useReconciliationCases(batchId === null ? null : fundId, 'open');
  const resolveMutation = useResolveReconciliationCase({ fundId });
  const bulkMutation = useBulkResolveReconciliationCases({ fundId });
  const [selectedCase, setSelectedCase] = useState<ReconciliationCaseDto | null>(null);
  const [draftByCaseId, setDraftByCaseId] = useState<Record<number, DecisionDraft>>({});
  const [bulkCaseIds, setBulkCaseIds] = useState<number[]>([]);
  const cases = useMemo(() => {
    const allCases = casesQuery.data?.cases ?? [];
    return batchId === null
      ? []
      : allCases.filter((reconciliationCase) => reconciliationCase.importBatchId === batchId);
  }, [batchId, casesQuery.data?.cases]);
  const selectedDraft =
    selectedCase !== null ? (draftByCaseId[selectedCase.id] ?? EMPTY_DECISION_DRAFT) : null;
  const selectedDecision =
    selectedCase !== null && selectedDraft !== null
      ? decisionFromDraft(selectedCase, selectedDraft)
      : null;
  const selectedBulkCases = useMemo(
    () => cases.filter((reconciliationCase) => bulkCaseIds.includes(reconciliationCase.id)),
    [bulkCaseIds, cases]
  );
  const bulkItems = useMemo(
    () =>
      selectedBulkCases
        .map((reconciliationCase) => {
          const decision = decisionFromDraft(
            reconciliationCase,
            draftByCaseId[reconciliationCase.id] ?? EMPTY_DECISION_DRAFT
          );
          return decision
            ? { caseId: reconciliationCase.id, ifMatch: reconciliationCase.etag, decision }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [draftByCaseId, selectedBulkCases]
  );
  const hasCompleteBulkDecisions =
    bulkCaseIds.length > 0 &&
    selectedBulkCases.length === bulkCaseIds.length &&
    bulkItems.length === selectedBulkCases.length;
  const canBulk = hasCompleteBulkDecisions && !bulkMutation.isPending;

  const updateDraft = useCallback((caseId: number, patch: Partial<DecisionDraft>) => {
    setDraftByCaseId((prev) => ({
      ...prev,
      [caseId]: { ...(prev[caseId] ?? EMPTY_DECISION_DRAFT), ...patch },
    }));
  }, []);

  const handleResolve = useCallback(async () => {
    if (selectedCase === null || selectedDecision === null) {
      return;
    }
    await resolveMutation.mutateAsync({
      caseId: selectedCase.id,
      ifMatch: selectedCase.etag,
      body: selectedDecision,
    });
    setSelectedCase(null);
  }, [resolveMutation, selectedCase, selectedDecision]);

  const handleBulkResolve = useCallback(async () => {
    if (!hasCompleteBulkDecisions) {
      return;
    }
    await bulkMutation.mutateAsync({ items: bulkItems });
  }, [bulkItems, bulkMutation, hasCompleteBulkDecisions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolve Blockers</CardTitle>
        <CardDescription>
          Open cases use current ETags. Every resolution requires an operator memo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorCard('imports-v2-cases-error', casesQuery.error)}
        {errorCard('imports-v2-resolve-error', resolveMutation.error)}
        {errorCard('imports-v2-bulk-error', bulkMutation.error)}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void casesQuery.refetch()}
            data-testid="imports-v2-refresh-cases"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh cases
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleBulkResolve()}
            disabled={!canBulk}
            data-testid="imports-v2-bulk-resolve-button"
          >
            {bulkMutation.isPending ? 'Resolving...' : 'Bulk resolve selected'}
          </Button>
        </div>
        {bulkCaseIds.length > 0 && !hasCompleteBulkDecisions ? (
          <p className="text-sm text-charcoal/70" data-testid="imports-v2-bulk-validation">
            Add a valid action, target, and memo for every selected case.
          </p>
        ) : null}
        {cases.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-charcoal/70">
            No open blockers.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Bulk</TableHead>
                <TableHead scope="col">Case</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col">Observation</TableHead>
                <TableHead scope="col">ETag</TableHead>
                <TableHead scope="col">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((reconciliationCase) => (
                <TableRow key={reconciliationCase.id}>
                  <TableCell>
                    <Checkbox
                      checked={bulkCaseIds.includes(reconciliationCase.id)}
                      onCheckedChange={(checked) =>
                        setBulkCaseIds((prev) =>
                          checked
                            ? [...prev, reconciliationCase.id]
                            : prev.filter((caseId) => caseId !== reconciliationCase.id)
                        )
                      }
                      aria-label={`Include case ${reconciliationCase.id} in bulk resolve`}
                      data-testid={`imports-v2-case-${reconciliationCase.id}-bulk`}
                    />
                  </TableCell>
                  <TableCell>{reconciliationCase.id}</TableCell>
                  <TableCell>{reconciliationCase.caseType}</TableCell>
                  <TableCell>{reconciliationCase.sourceObservationId ?? '--'}</TableCell>
                  <TableCell>{reconciliationCase.etag}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        updateDraft(reconciliationCase.id, {
                          action: actionOptions(reconciliationCase.caseType)[0],
                        });
                        setSelectedCase(reconciliationCase);
                      }}
                      data-testid={`imports-v2-case-${reconciliationCase.id}-open`}
                    >
                      Resolve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {bulkMutation.data ? <BulkResults results={bulkMutation.data} /> : null}
      </CardContent>

      <Dialog open={selectedCase !== null} onOpenChange={(open) => !open && setSelectedCase(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolve case {selectedCase?.id}</DialogTitle>
            <DialogDescription>
              Decisions are constrained by case type and submitted with the case ETag.
            </DialogDescription>
          </DialogHeader>
          {selectedCase && selectedDraft ? (
            <div className="space-y-4" data-testid="imports-v2-resolution-dialog">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={selectedDraft.action}
                  onValueChange={(value) =>
                    updateDraft(selectedCase.id, { action: value as ResolutionAction })
                  }
                >
                  <SelectTrigger data-testid="imports-v2-resolution-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionOptions(selectedCase.caseType).map((action) => (
                      <SelectItem key={action} value={action}>
                        {labelForAction(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCase.caseType === 'observation_match' &&
              selectedDraft.action === 'confirm_match' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Canonical record kind</Label>
                    <Select
                      value={selectedDraft.targetCanonicalRecordKind}
                      onValueChange={(value) =>
                        updateDraft(selectedCase.id, {
                          targetCanonicalRecordKind: value as ReconciliationCanonicalRecordKind,
                        })
                      }
                    >
                      <SelectTrigger data-testid="imports-v2-canonical-kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash_flow_event">Cash flow event</SelectItem>
                        <SelectItem value="valuation_mark">Valuation mark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imports-v2-canonical-id">Canonical record ID</Label>
                    <Input
                      id="imports-v2-canonical-id"
                      inputMode="numeric"
                      value={selectedDraft.targetCanonicalRecordId}
                      onChange={(event) =>
                        updateDraft(selectedCase.id, {
                          targetCanonicalRecordId: event.target.value,
                        })
                      }
                      data-testid="imports-v2-canonical-id"
                    />
                  </div>
                </div>
              ) : null}

              {selectedCase.caseType === 'identity_resolution' &&
              selectedDraft.action === 'confirm_match' ? (
                <div className="space-y-2">
                  <Label htmlFor="imports-v2-target-identity">Target company identity ID</Label>
                  <Input
                    id="imports-v2-target-identity"
                    inputMode="numeric"
                    value={selectedDraft.targetCompanyIdentityId}
                    onChange={(event) =>
                      updateDraft(selectedCase.id, {
                        targetCompanyIdentityId: event.target.value,
                      })
                    }
                    data-testid="imports-v2-target-identity-id"
                  />
                </div>
              ) : null}

              {selectedCase.caseType === 'identity_resolution' &&
              selectedDraft.action === 'create_identity' ? (
                <div className="space-y-2">
                  <Label htmlFor="imports-v2-canonical-name">Canonical name</Label>
                  <Input
                    id="imports-v2-canonical-name"
                    value={selectedDraft.canonicalName}
                    onChange={(event) =>
                      updateDraft(selectedCase.id, { canonicalName: event.target.value })
                    }
                    data-testid="imports-v2-canonical-name"
                  />
                </div>
              ) : null}

              {selectedCase.caseType === 'identity_resolution' &&
              selectedDraft.action === 'merge_identities' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="imports-v2-source-identity">Source identity ID</Label>
                    <Input
                      id="imports-v2-source-identity"
                      inputMode="numeric"
                      value={selectedDraft.sourceCompanyIdentityId}
                      onChange={(event) =>
                        updateDraft(selectedCase.id, {
                          sourceCompanyIdentityId: event.target.value,
                        })
                      }
                      data-testid="imports-v2-source-identity-id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imports-v2-merge-target-identity">Target identity ID</Label>
                    <Input
                      id="imports-v2-merge-target-identity"
                      inputMode="numeric"
                      value={selectedDraft.targetCompanyIdentityId}
                      onChange={(event) =>
                        updateDraft(selectedCase.id, {
                          targetCompanyIdentityId: event.target.value,
                        })
                      }
                      data-testid="imports-v2-merge-target-identity-id"
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="imports-v2-resolution-memo">Memo</Label>
                <Textarea
                  id="imports-v2-resolution-memo"
                  value={selectedDraft.memo}
                  onChange={(event) => updateDraft(selectedCase.id, { memo: event.target.value })}
                  data-testid="imports-v2-resolution-memo"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void handleResolve()}
              disabled={selectedDecision === null || resolveMutation.isPending}
              data-testid="imports-v2-resolution-submit"
            >
              {resolveMutation.isPending ? 'Resolving...' : 'Resolve case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BulkResults({ results }: { results: BulkResolveResponse }) {
  return (
    <div className="space-y-2" data-testid="imports-v2-bulk-results">
      <h3 className="text-sm font-semibold text-charcoal">Bulk results</h3>
      {results.results.map((result) => (
        <Alert
          key={result.caseId}
          variant={result.ok ? 'default' : 'destructive'}
          data-testid={`imports-v2-bulk-result-${result.caseId}`}
          data-http-status={result.httpStatus}
        >
          <AlertTitle>
            Case {result.caseId}: {result.ok ? 'resolved' : result.error?.code}
          </AlertTitle>
          <AlertDescription>{result.error?.message ?? 'Resolution accepted.'}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

interface CommitPanelProps {
  fundId: number | null;
  receipt: StageImportBatchReceipt | null;
  status: ImportBatchStatusResponse | null;
}

function CommitPanel({ fundId, receipt, status }: CommitPanelProps) {
  const commitMutation = useCommitImportBatch({ fundId });
  const [requestedGroupKeys, setRequestedGroupKeys] = useState<string[]>([]);
  const selectableGroups = useMemo(() => {
    if (status === null) {
      return [];
    }
    const blockerCaseIds = new Set(status.blockers.map((blocker) => blocker.caseId));
    return status.groups.filter(
      (group) => !group.accepted && group.caseIds.every((caseId) => !blockerCaseIds.has(caseId))
    );
  }, [status]);
  const selectableGroupKeys = useMemo(
    () => new Set(selectableGroups.map((group) => group.dependencyGroupKey)),
    [selectableGroups]
  );
  const requestedGroupsAreSelectable = requestedGroupKeys.every((groupKey) =>
    selectableGroupKeys.has(groupKey)
  );
  const canCommit =
    receipt !== null &&
    status !== null &&
    requestedGroupKeys.length > 0 &&
    requestedGroupsAreSelectable &&
    !status.expired &&
    !commitMutation.isPending;

  const handleCommit = useCallback(async () => {
    if (!receipt || !status || !canCommit) {
      return;
    }
    await commitMutation.mutateAsync({
      batchId: status.batchId,
      ifMatch: status.etag,
      body: {
        previewHash: receipt.previewHash,
        requestedGroupKeys,
      },
    });
  }, [canCommit, commitMutation, receipt, requestedGroupKeys, status]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commit Accepted Evidence</CardTitle>
        <CardDescription>
          Select complete singleton groups. Preview hash is echoed at commit and not displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorCard('imports-v2-commit-error', commitMutation.error)}
        {selectableGroups.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-charcoal/70">
            No complete singleton groups available.
          </div>
        ) : (
          <div className="space-y-3">
            {selectableGroups.map((group) => (
              <label
                key={group.dependencyGroupKey}
                className="flex items-center gap-3 rounded-md border border-beige-200 p-3"
              >
                <Checkbox
                  checked={requestedGroupKeys.includes(group.dependencyGroupKey)}
                  onCheckedChange={(checked) =>
                    setRequestedGroupKeys((prev) =>
                      checked
                        ? [...prev, group.dependencyGroupKey]
                        : prev.filter((key) => key !== group.dependencyGroupKey)
                    )
                  }
                  data-testid={`imports-v2-group-${group.observationId}-checkbox`}
                />
                <span className="text-sm">
                  {group.dependencyGroupKey} / observation {group.observationId}
                </span>
              </label>
            ))}
          </div>
        )}
        {commitMutation.data ? (
          <Alert data-testid="imports-v2-commit-result">
            <AlertTitle>Batch committed</AlertTitle>
            <AlertDescription>
              Status {commitMutation.data.batch.status}; ETag {commitMutation.data.batch.etag}.
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          onClick={() => void handleCommit()}
          disabled={!canCommit}
          data-testid="imports-v2-commit-button"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {commitMutation.isPending ? 'Committing...' : 'Commit selected groups'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LpReportingImportsPage() {
  const { fundId } = useFundContext();
  const [receipt, setReceipt] = useState<StageImportBatchReceipt | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const statusQuery = useImportBatchStatus(fundId, batchId);
  const status = statusQuery.data ?? null;

  const handleStaged = useCallback((nextReceipt: StageImportBatchReceipt) => {
    setReceipt(nextReceipt);
    setBatchId(nextReceipt.batchId);
  }, []);

  return (
    <div className="space-y-6 p-8" data-testid="imports-v2-page">
      <header>
        <h1 className="font-inter text-3xl font-bold text-charcoal">Imports</h1>
        <p className="mt-1 font-poppins text-charcoal/70">
          Stage CSV evidence, resolve reconciliation blockers, then accept singleton groups.
        </p>
      </header>

      {fundId === null ? (
        <Alert>
          <AlertTitle>Select a fund</AlertTitle>
          <AlertDescription>
            Choose a fund from the header to stage and reconcile CSV evidence.
          </AlertDescription>
        </Alert>
      ) : null}

      <StagePanel fundId={fundId} onStaged={handleStaged} />

      {receipt ? (
        <Alert data-testid="imports-v2-stage-result">
          <AlertTitle>Batch {receipt.batchId} staged</AlertTitle>
          <AlertDescription>
            {receipt.observations.length} observation(s), {receipt.initialCaseIds.length} initial
            blocker(s), purge after {receipt.purgeAfter}.
          </AlertDescription>
        </Alert>
      ) : null}

      {errorCard('imports-v2-status-error', statusQuery.error)}

      {status ? (
        <>
          <ImportPreviewPanel batchStatus={status} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batch Warnings</CardTitle>
              <CardDescription>Expiry and blocker warnings for the staged batch.</CardDescription>
            </CardHeader>
            <CardContent>
              <ImportWarningsList batchStatus={status} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {batchId !== null ? <CasesPanel fundId={fundId} batchId={batchId} /> : null}
      {receipt !== null ? <CommitPanel fundId={fundId} receipt={receipt} status={status} /> : null}

      {status ? (
        <div
          className="flex flex-wrap gap-2 text-xs text-charcoal/70"
          data-testid="imports-v2-tags"
        >
          <Badge variant="outline">Current ETag {status.etag}</Badge>
          <Badge variant="outline">{status.expired ? 'Expired' : 'Active'}</Badge>
          <Badge variant="outline">Purge after {status.purgeAfter}</Badge>
        </div>
      ) : null}
    </div>
  );
}
