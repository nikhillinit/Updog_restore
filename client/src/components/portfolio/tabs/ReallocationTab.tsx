import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePortfolioCompanies } from '@/hooks/use-fund-data';
import { useFundContext } from '@/contexts/FundContext';
import { useReallocationPreview } from '@/hooks/useReallocationPreview';
import { useReallocationCommit } from '@/hooks/useReallocationCommit';
import { useLatestAllocations } from './hooks/useLatestAllocations';
import { CompanySelectionTable } from './CompanySelectionTable';
import { DeltaSummary } from './DeltaSummary';
import { TotalsSummary } from './TotalsSummary';
import { WarningsPanel } from './WarningsPanel';
import { canCommit, getBlockingErrors } from '@/lib/reallocation-utils';
import type {
  SelectedCompany,
  ReallocationPreviewResponse,
  ProposedAllocation,
} from '@/types/reallocation';
import { Loader2, AlertCircle } from 'lucide-react';

interface StoredPreview {
  data: ReallocationPreviewResponse;
  generation: number;
  fingerprint: string;
  proposedAllocations: ProposedAllocation[];
}

export function createReallocationFingerprint(
  fundId: number,
  proposedAllocations: ProposedAllocation[]
): string {
  return JSON.stringify({
    fundId,
    proposedAllocations: [...proposedAllocations]
      .sort((a, b) => a.company_id - b.company_id)
      .map((allocation) => ({
        company_id: allocation.company_id,
        planned_reserves_cents: allocation.planned_reserves_cents,
        ...(allocation.allocation_cap_cents === undefined
          ? {}
          : { allocation_cap_cents: allocation.allocation_cap_cents }),
        expected_version: allocation.expected_version,
      })),
  });
}

export function ReallocationTab() {
  const { toast } = useToast();
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();
  const previewGenerationRef = useRef(0);

  // State
  const [selectedCompanies, setSelectedCompanies] = useState<SelectedCompany[]>([]);
  const [previewData, setPreviewData] = useState<StoredPreview | null>(null);
  const [commitReason, setCommitReason] = useState('');

  // Data fetching
  const { portfolioCompanies, isLoading: isLoadingCompanies } = usePortfolioCompanies(
    fundId || undefined
  );
  const { data: latestAllocations, isLoading: isLoadingLatestAllocations } = useLatestAllocations();

  const allocationVersions = new Map(
    (latestAllocations?.companies ?? []).map((company) => [
      company.company_id,
      company.allocation_version,
    ])
  );
  const hasInvalidAmount = selectedCompanies.some((company) => company.invalidInput === true);
  // This tab has no cap editor, so it never sends allocation_cap_cents: the
  // server's COALESCE keeps whatever cap is stored, including a concurrent
  // change made after selection.
  const proposedAllocations =
    selectedCompanies.length > 0 &&
    !hasInvalidAmount &&
    selectedCompanies.every((company) => (allocationVersions.get(company.id) ?? 0) > 0)
      ? selectedCompanies.map((company) => ({
          company_id: company.id,
          planned_reserves_cents: company.newAllocation,
          expected_version: allocationVersions.get(company.id)!,
        }))
      : null;
  const currentFingerprint = proposedAllocations
    ? createReallocationFingerprint(fundId || 0, proposedAllocations)
    : null;
  const currentFingerprintRef = useRef<string | null>(null);
  currentFingerprintRef.current = currentFingerprint;

  // Mutations
  const previewMutation = useReallocationPreview(fundId || 0);
  const commitMutation = useReallocationCommit(fundId || 0);
  const mutationsRef = useRef({ previewMutation, commitMutation });
  mutationsRef.current = { previewMutation, commitMutation };

  // A fund switch drops the whole draft: company IDs are fund-scoped, so
  // selections from the previous fund could never be previewed or deselected.
  // Resetting the mutation observers detaches any in-flight request of the
  // previous fund so its isPending state cannot disable this fund's controls.
  useEffect(() => {
    previewGenerationRef.current += 1;
    setSelectedCompanies([]);
    setPreviewData(null);
    setCommitReason('');
    mutationsRef.current.previewMutation.reset();
    mutationsRef.current.commitMutation.reset();
  }, [fundId]);

  const handleSelectionChange = (selected: SelectedCompany[]) => {
    previewGenerationRef.current += 1;
    setSelectedCompanies(selected);
    setPreviewData(null);
  };

  const handleVersionConflict = () => {
    previewGenerationRef.current += 1;
    setPreviewData(null);
    if (fundId) {
      void queryClient.invalidateQueries({ queryKey: ['allocations', 'latest', fundId] });
    }
    toast({
      title: 'Allocations changed',
      description: 'Refresh applied. Preview again before committing.',
      variant: 'destructive',
    });
  };

  // Handle preview
  const handlePreview = () => {
    if (selectedCompanies.length === 0) {
      toast({
        title: 'No companies selected',
        description: 'Please select at least one company to reallocate',
        variant: 'destructive',
      });
      return;
    }

    if (!proposedAllocations) {
      toast({
        title: 'Allocation versions unavailable',
        description: 'Refresh allocation data before previewing changes.',
        variant: 'destructive',
      });
      return;
    }

    const generation = ++previewGenerationRef.current;
    const fingerprint = createReallocationFingerprint(fundId || 0, proposedAllocations);
    const frozenProposedAllocations = proposedAllocations.map((allocation) => ({ ...allocation }));

    previewMutation.mutate(
      {
        proposed_allocations: frozenProposedAllocations,
      },
      {
        onSuccess: (data) => {
          if (
            generation !== previewGenerationRef.current ||
            fingerprint !== currentFingerprintRef.current
          ) {
            return;
          }
          setPreviewData({
            data,
            generation,
            fingerprint,
            proposedAllocations: frozenProposedAllocations,
          });
          toast({
            title: 'Preview generated',
            description: 'Review the changes before committing',
          });
        },
        onError: (error) => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          if (error.status === 409) {
            handleVersionConflict();
            return;
          }
          toast({
            title: 'Preview failed',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  // Handle commit
  const handleCommit = () => {
    if (!previewData) {
      toast({
        title: 'No preview available',
        description: 'Please preview changes before committing',
        variant: 'destructive',
      });
      return;
    }

    if (
      previewData.generation !== previewGenerationRef.current ||
      previewData.fingerprint !== currentFingerprint
    ) {
      toast({
        title: 'Preview required',
        description: 'Preview current allocation changes before committing.',
        variant: 'destructive',
      });
      return;
    }

    const blockingErrors = getBlockingErrors(previewData.data);
    if (blockingErrors.length > 0) {
      toast({
        title: 'Cannot commit',
        description: blockingErrors[0],
        variant: 'destructive',
      });
      return;
    }

    if (!commitReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Please provide a reason for this reallocation',
        variant: 'destructive',
      });
      return;
    }

    // Any edit, reset, fund switch, or conflict bumps the generation; a commit
    // response that arrives after that belongs to a draft the user no longer has.
    const generation = previewData.generation;
    commitMutation.mutate(
      {
        proposed_allocations: previewData.proposedAllocations,
        reason: commitReason,
      },
      {
        onSuccess: (data) => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          toast({
            title: 'Reallocation committed',
            description: `Changes saved successfully at ${data.timestamp}`,
          });
          // Reset form
          resetForm();
        },
        onError: (error) => {
          if (generation !== previewGenerationRef.current) {
            return;
          }
          if (error.status === 409) {
            handleVersionConflict();
          } else {
            toast({
              title: 'Commit failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        },
      }
    );
  };

  // Reset form
  const resetForm = () => {
    previewGenerationRef.current += 1;
    setSelectedCompanies([]);
    setPreviewData(null);
    setCommitReason('');
  };

  // No fund selected
  if (!fundId) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-charcoal-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-pov-charcoal mb-2">No Fund Selected</h3>
          <p className="text-charcoal-600">Please select a fund to manage allocations</p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoadingCompanies) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-charcoal-400" />
      </div>
    );
  }

  // Empty state
  if (portfolioCompanies.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-charcoal-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-pov-charcoal mb-2">No Companies Found</h3>
          <p className="text-charcoal-600">Add portfolio companies to begin managing allocations</p>
        </CardContent>
      </Card>
    );
  }

  const hasFreshPreview =
    previewData !== null &&
    previewData.generation === previewGenerationRef.current &&
    previewData.fingerprint === currentFingerprint;
  const canCommitChanges = hasFreshPreview && canCommit(previewData.data, commitReason);
  const hasPreview = previewData !== null;
  const versionsUnavailable =
    selectedCompanies.length > 0 &&
    !hasInvalidAmount &&
    proposedAllocations === null &&
    !isLoadingLatestAllocations;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Company Selection */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Select Companies to Reallocate</CardTitle>
            <p className="text-sm text-charcoal-600">
              Choose companies and adjust their planned reserve allocations
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompanySelectionTable
              key={fundId}
              companies={portfolioCompanies}
              selectedCompanies={selectedCompanies}
              onSelectionChange={handleSelectionChange}
            />

            {(isLoadingLatestAllocations || versionsUnavailable || hasInvalidAmount) && (
              <p className="text-sm text-charcoal-600" data-testid="allocation-version-note">
                {hasInvalidAmount
                  ? 'Enter a valid amount for every selected company before previewing.'
                  : isLoadingLatestAllocations
                    ? 'Loading allocation versions...'
                    : 'Allocation version unavailable; refresh allocation data before previewing.'}
              </p>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-charcoal-600">
                {selectedCompanies.length} company(ies) selected
              </div>
              <Button
                onClick={handlePreview}
                disabled={
                  selectedCompanies.length === 0 ||
                  proposedAllocations === null ||
                  previewMutation.isPending ||
                  isLoadingLatestAllocations
                }
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Previewing...
                  </>
                ) : (
                  'Preview Changes'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Preview and Commit */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Reallocation Preview</CardTitle>
            <p className="text-sm text-charcoal-600">Review changes and commit when ready</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasPreview ? (
              <div className="rounded-md border border-dashed border-charcoal-300 bg-pov-gray p-12 text-center">
                <p className="text-charcoal-500">Preview changes to see detailed summary</p>
              </div>
            ) : (
              <>
                {/* Deltas */}
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-700 mb-2">
                    Changes by Company
                  </h3>
                  <DeltaSummary deltas={previewData.data.deltas} />
                </div>

                {/* Totals */}
                <div>
                  <TotalsSummary totals={previewData.data.totals} />
                </div>

                {/* Warnings */}
                <div>
                  <WarningsPanel warnings={previewData.data.warnings} />
                </div>

                {/* Commit Reason */}
                <div className="space-y-2">
                  <label htmlFor="commit-reason" className="text-sm font-medium text-charcoal-700">
                    Reason for Reallocation <span className="text-error">*</span>
                  </label>
                  <Textarea
                    id="commit-reason"
                    placeholder="e.g., Adjusting reserves based on Q3 performance review"
                    value={commitReason}
                    onChange={(e) => setCommitReason(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-charcoal-500">
                    This reason will be recorded in the audit log
                  </p>
                </div>

                {/* Commit Button */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button variant="outline" onClick={resetForm} disabled={commitMutation.isPending}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCommit}
                    disabled={!canCommitChanges || commitMutation.isPending}
                    className="flex-1"
                  >
                    {commitMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Committing...
                      </>
                    ) : (
                      'Commit Changes'
                    )}
                  </Button>
                </div>

                {!canCommitChanges && commitReason.trim() && (
                  <div className="rounded-md bg-error/10 border border-error/30 p-3">
                    <p className="text-xs text-error-dark flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Cannot commit: Please resolve all blocking errors first
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
