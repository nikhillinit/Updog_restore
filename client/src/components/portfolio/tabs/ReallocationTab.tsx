/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePortfolioCompanies } from '@/hooks/use-fund-data';
import { useFundContext } from '@/contexts/FundContext';
import { useReallocationPreview } from '@/hooks/useReallocationPreview';
import { useReallocationCommit } from '@/hooks/useReallocationCommit';
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

export function ReallocationTab() {
  const { toast } = useToast();
  const { fundId } = useFundContext();
  const currentVersion = 1; // TODO: Get from API

  // State
  const [selectedCompanies, setSelectedCompanies] = useState<
    SelectedCompany[]
  >([]);
  const [previewData, setPreviewData] =
    useState<ReallocationPreviewResponse | null>(null);
  const [commitReason, setCommitReason] = useState('');

  // Data fetching
  const { portfolioCompanies, isLoading: isLoadingCompanies } =
    usePortfolioCompanies(fundId || undefined);

  // Mutations
  const previewMutation = useReallocationPreview(fundId || 0);
  const commitMutation = useReallocationCommit(fundId || 0);

  // Reset preview when selection changes
  useEffect(() => {
    setPreviewData(null);
  }, [selectedCompanies]);

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

    const proposedAllocations: ProposedAllocation[] = selectedCompanies.map(
      (company) => ({
        company_id: company.id,
        planned_reserves_cents: company.newAllocation,
        allocation_cap_cents: company.cap,
      })
    );

    previewMutation.mutate(
      {
        current_version: currentVersion,
        proposed_allocations: proposedAllocations,
      },
      {
        onSuccess: (data) => {
          setPreviewData(data);
          toast({
            title: 'Preview generated',
            description: 'Review the changes before committing',
          });
        },
        onError: (error) => {
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

    const blockingErrors = getBlockingErrors(previewData);
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

    const proposedAllocations: ProposedAllocation[] = selectedCompanies.map(
      (company) => ({
        company_id: company.id,
        planned_reserves_cents: company.newAllocation,
        allocation_cap_cents: company.cap,
      })
    );

    commitMutation.mutate(
      {
        current_version: currentVersion,
        proposed_allocations: proposedAllocations,
        reason: commitReason,
      },
      {
        onSuccess: (data) => {
          toast({
            title: 'Reallocation committed',
            description: `Changes saved successfully at ${data.timestamp}`,
          });
          // Reset form
          resetForm();
        },
        onError: (error) => {
          if (error.status === 409) {
            toast({
              title: 'Version conflict',
              description:
                'The allocation has been modified by another user. Please refresh and try again.',
              variant: 'destructive',
            });
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
    setSelectedCompanies([]);
    setPreviewData(null);
    setCommitReason('');
  };

  // No fund selected
  if (!fundId) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Fund Selected
          </h3>
          <p className="text-gray-600">
            Please select a fund to manage allocations
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoadingCompanies) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Empty state
  if (portfolioCompanies.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Companies Found
          </h3>
          <p className="text-gray-600">
            Add portfolio companies to begin managing allocations
          </p>
        </CardContent>
      </Card>
    );
  }

  const canCommitChanges = canCommit(previewData, commitReason);
  const hasPreview = previewData !== null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Company Selection */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Select Companies to Reallocate</CardTitle>
            <p className="text-sm text-gray-600">
              Choose companies and adjust their planned reserve allocations
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompanySelectionTable
              companies={portfolioCompanies}
              selectedCompanies={selectedCompanies}
              onSelectionChange={setSelectedCompanies}
            />

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-gray-600">
                {selectedCompanies.length} company(ies) selected
              </div>
              <Button
                onClick={handlePreview}
                disabled={
                  selectedCompanies.length === 0 || previewMutation.isPending
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
            <p className="text-sm text-gray-600">
              Review changes and commit when ready
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasPreview ? (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                <p className="text-gray-500">
                  Preview changes to see detailed summary
                </p>
              </div>
            ) : (
              <>
                {/* Deltas */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Changes by Company
                  </h3>
                  <DeltaSummary deltas={previewData.deltas} />
                </div>

                {/* Totals */}
                <div>
                  <TotalsSummary totals={previewData.totals} />
                </div>

                {/* Warnings */}
                <div>
                  <WarningsPanel warnings={previewData.warnings} />
                </div>

                {/* Commit Reason */}
                <div className="space-y-2">
                  <label
                    htmlFor="commit-reason"
                    className="text-sm font-medium text-gray-700"
                  >
                    Reason for Reallocation{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    id="commit-reason"
                    placeholder="e.g., Adjusting reserves based on Q3 performance review"
                    value={commitReason}
                    onChange={(e) => setCommitReason(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-gray-500">
                    This reason will be recorded in the audit log
                  </p>
                </div>

                {/* Commit Button */}
                <div className="flex items-center gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={commitMutation.isPending}
                  >
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
                  <div className="rounded-md bg-red-50 border border-red-200 p-3">
                    <p className="text-xs text-red-700 flex items-center gap-2">
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
