/**
 * InvestmentEditorDialog - Split-screen investment editor dialog
 *
 * Orchestrates the investment editor with context panel (KPIs + Timeline).
 * Desktop: side-by-side layout with sticky right panel
 * Mobile: stacked with collapsible context section
 *
 * @module client/components/investments/InvestmentEditorDialog
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { ChevronDown } from 'lucide-react';
import { useFundContext } from '@/contexts/FundContext';
import { useFundMetrics, useInvalidateMetrics } from '@/hooks/useFundMetrics';
import { useInvalidateFund } from '@/hooks/useInvalidateQueries';
import {
  formatCurrencyM,
  formatDPI,
  formatIRR,
  formatMultiple,
} from '@/lib/format-metrics';
import { cn } from '@/lib/utils';
import { SplitPane } from '@/components/ui/SplitPane';
import InvestmentEditor from './investment-editor';
import InvestmentTimeline from './InvestmentTimeline';

type InvestmentEditorDialogProps = {
  /** Dialog open state */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Sector profile ID */
  profileId?: string;
  /** Sector profile display name */
  profileName?: string;
  /** Entry round (e.g., "Seed", "Series A") */
  entryRound?: string;
  /** Callback when investment is complete */
  onComplete?: () => void;
};

export default function InvestmentEditorDialog({
  open,
  onOpenChange,
  profileId,
  profileName,
  entryRound,
  onComplete,
}: InvestmentEditorDialogProps) {
  const [showContext, setShowContext] = useState(false);
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();
  const { data: metrics } = useFundMetrics({ skipProjections: true });
  const { invalidateMetrics } = useInvalidateMetrics();
  const { invalidatePortfolio } = useInvalidateFund();

  const actual = metrics?.actual;
  const profileLabel = profileName ?? 'Default Profile';
  const roundLabel = entryRound ?? 'Seed';

  // Format helper functions with null safety
  const formatCurrencyValue = (value?: number) =>
    value === undefined ? '--' : formatCurrencyM(value);
  const formatIrrValue = (value?: number | null) =>
    value === null || value === undefined ? 'N/A' : formatIRR(value);
  const formatMultipleValue = (value?: number) =>
    value === undefined ? '--' : formatMultiple(value);
  const formatDpiValue = (value?: number | null) =>
    value === undefined || value === null ? 'N/A' : formatDPI(value);

  const kpis = [
    { label: 'Total Value', value: formatCurrencyValue(actual?.totalValue) },
    { label: 'Net IRR', value: formatIrrValue(actual?.irr) },
    { label: 'TVPI', value: formatMultipleValue(actual?.tvpi) },
    { label: 'DPI', value: formatDpiValue(actual?.dpi) },
  ];

  const handleComplete = () => {
    // Invalidate all relevant caches using Promise.allSettled for resilience
    const tasks: Promise<unknown>[] = [invalidateMetrics()];

    if (fundId) {
      tasks.push(invalidatePortfolio(fundId));
      tasks.push(
        queryClient.invalidateQueries({ queryKey: ['/api/timeline', fundId] })
      );
    }

    // Fire and forget - don't block dialog close on invalidation
    void Promise.allSettled(tasks).then((results) => {
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.warn('[InvestmentEditorDialog] Cache invalidation failures:', failures);
      }
    });

    onComplete?.();
  };

  // Context panel content (KPIs + Timeline)
  const contextPanel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4" data-testid="kpi-preview">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            className="bg-presson-surface border-presson-borderSubtle"
          />
        ))}
      </div>
      <InvestmentTimeline {...(fundId ? { fundId } : {})} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="investment-editor-dialog"
        className="max-w-6xl max-h-[90vh] overflow-hidden border-presson-borderSubtle bg-presson-surface"
      >
        <DialogHeader>
          <DialogTitle className="text-presson-text">Investment Editor</DialogTitle>
          <DialogDescription className="text-presson-textMuted">
            Add new investment using {profileLabel} profile, starting at {roundLabel} round.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="max-h-[calc(90vh-140px)] overflow-y-auto pr-2">
          {/* Mobile: Collapsible context panel */}
          <div className="md:hidden mb-4 rounded-lg border border-presson-borderSubtle bg-presson-surfaceSubtle p-4">
            <Collapsible open={showContext} onOpenChange={setShowContext}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-presson-text">
                    Context and KPIs
                  </div>
                  <div className="text-xs text-presson-textMuted">
                    Timeline and fund metrics
                  </div>
                </div>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-presson-borderSubtle"
                    data-testid="context-panel-toggle"
                  >
                    {showContext ? 'Hide' : 'Show'}
                    <ChevronDown
                      className={cn(
                        'ml-2 h-4 w-4 transition-transform',
                        showContext ? 'rotate-180' : ''
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="mt-4">
                {contextPanel}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Desktop: SplitPane layout */}
          <SplitPane
            left={
              <InvestmentEditor
                {...(profileId ? { profileId } : {})}
                {...(entryRound ? { entryRound } : {})}
                onComplete={handleComplete}
              />
            }
            right={contextPanel}
            rightWidth="360px"
            stackAt="md"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
