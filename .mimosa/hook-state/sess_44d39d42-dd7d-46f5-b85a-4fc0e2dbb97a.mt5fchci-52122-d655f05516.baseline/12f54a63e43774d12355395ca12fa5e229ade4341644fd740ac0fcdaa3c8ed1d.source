import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatCents } from '@/lib/units';
import type { PlanningFmvOverrideRecord } from '@shared/contracts/lp-reporting';
import type { AllocationCompany } from './types';
import { useCreatePlanningFmvOverride } from './hooks/usePlanningFmvOverrides';

interface FmvOverrideDialogProps {
  company: AllocationCompany | null;
  currentMark: PlanningFmvOverrideRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioActive: boolean;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDecimalCurrency(value: string | null | undefined): string {
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

function normalizeDecimalInput(value: string): string {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error('Fair value must be a non-negative decimal amount');
  }
  return normalized;
}

export function FmvOverrideDialog({
  company,
  currentMark,
  open,
  onOpenChange,
  scenarioActive,
}: FmvOverrideDialogProps) {
  const { toast } = useToast();
  const createMutation = useCreatePlanningFmvOverride();
  const [fairValue, setFairValue] = useState('');
  const [markDate, setMarkDate] = useState(todayIsoDate());
  const [reason, setReason] = useState('');
  const [methodologyNotes, setMethodologyNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!company) {
      return;
    }

    setFairValue(currentMark?.fairValue ?? '');
    setMarkDate(todayIsoDate());
    setReason(company.allocation_reason ?? '');
    setMethodologyNotes('');
    setErrors({});
  }, [company, currentMark]);

  const validate = (): string | null => {
    const nextErrors: Record<string, string> = {};
    let normalizedFairValue: string | null = null;

    try {
      normalizedFairValue = normalizeDecimalInput(fairValue);
    } catch (error) {
      nextErrors['fairValue'] = error instanceof Error ? error.message : 'Invalid fair value';
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(markDate)) {
      nextErrors['markDate'] = 'Mark date must be YYYY-MM-DD';
    }

    if (!reason.trim()) {
      nextErrors['reason'] = 'Approval reason is required';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? normalizedFairValue : null;
  };

  const handleSubmit = async () => {
    if (!company || scenarioActive) {
      return;
    }

    const normalizedFairValue = validate();
    if (!normalizedFairValue) {
      return;
    }

    try {
      await createMutation.mutateAsync({
        companyId: company.company_id,
        markDate,
        fairValue: normalizedFairValue,
        currency: 'USD',
        confidenceLevel: 'medium',
        reason: reason.trim(),
        methodologyNotes: methodologyNotes.trim() || undefined,
        source: {
          allocationVersion: company.allocation_version,
          plannedReservesCents: company.planned_reserves_cents,
          allocationReason: company.allocation_reason,
        },
      });

      toast({
        title: 'Approved mark saved',
        description: `${company.company_name} now has an approved Planning FMV mark.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Planning FMV save failed',
        description: error instanceof Error ? error.message : 'Failed to save approved mark',
        variant: 'destructive',
      });
    }
  };

  if (!company) {
    return null;
  }

  const isPending = createMutation.isPending;
  const saveDisabled = scenarioActive || isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Planning FMV - {company.company_name}</DialogTitle>
          <DialogDescription>
            Save an approved GP estimate from the live reserve planning workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {scenarioActive ? (
            <Alert variant="default">
              <AlertDescription>
                Planning FMV overrides can only be saved from the live allocation workspace.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4 rounded-md bg-pov-gray p-3">
            <div>
              <p className="text-sm text-charcoal-500">Current FMV</p>
              <p className="text-sm font-medium">{formatDecimalCurrency(currentMark?.fairValue)}</p>
            </div>
            <div>
              <p className="text-sm text-charcoal-500">Current Mark Date</p>
              <p className="text-sm font-medium">{currentMark?.markDate ?? 'No mark'}</p>
            </div>
            <div>
              <p className="text-sm text-charcoal-500">Planned Reserves</p>
              <p className="text-sm font-medium">
                {formatCents(company.planned_reserves_cents, { compact: true })}
              </p>
            </div>
            <div>
              <p className="text-sm text-charcoal-500">Allocation Version</p>
              <p className="text-sm font-medium">v{company.allocation_version}</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="planning-fmv-fair-value">
              Fair Value <span className="text-error">*</span>
            </Label>
            <Input
              id="planning-fmv-fair-value"
              type="number"
              step="0.01"
              min="0"
              value={fairValue}
              onChange={(event) => setFairValue(event.target.value)}
              placeholder="e.g., 12500000"
              className={errors['fairValue'] ? 'border-error' : ''}
              disabled={saveDisabled}
            />
            {errors['fairValue'] ? (
              <p className="text-sm text-error">{errors['fairValue']}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="planning-fmv-mark-date">
              Mark Date <span className="text-error">*</span>
            </Label>
            <Input
              id="planning-fmv-mark-date"
              type="date"
              value={markDate}
              onChange={(event) => setMarkDate(event.target.value)}
              className={errors['markDate'] ? 'border-error' : ''}
              disabled={saveDisabled}
            />
            {errors['markDate'] ? <p className="text-sm text-error">{errors['markDate']}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="planning-fmv-reason">
              Approval Reason <span className="text-error">*</span>
            </Label>
            <Textarea
              id="planning-fmv-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`min-h-[88px] ${errors['reason'] ? 'border-error' : ''}`}
              maxLength={1000}
              disabled={saveDisabled}
            />
            {errors['reason'] ? <p className="text-sm text-error">{errors['reason']}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="planning-fmv-methodology">Methodology Notes</Label>
            <Textarea
              id="planning-fmv-methodology"
              value={methodologyNotes}
              onChange={(event) => setMethodologyNotes(event.target.value)}
              className="min-h-[88px]"
              maxLength={4000}
              disabled={saveDisabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saveDisabled}>
            {isPending ? 'Saving...' : 'Save approved mark'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
