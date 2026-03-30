/**
 * Edit Allocation Dialog Component
 * Allows editing of planned reserves, allocation cap, and allocation reason
 */
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUpdateAllocations } from './hooks/useUpdateAllocations';
import { centsToDollars, dollarsToCents, formatCents } from '@/lib/units';
import { format } from 'date-fns';
import type { AllocationCompany, UpdateAllocationPayload } from './types';

interface EditAllocationDialogProps {
  company: AllocationCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'live' | 'scenario';
  onSaveScenarioDraft?: (update: UpdateAllocationPayload) => void;
}

export function EditAllocationDialog({
  company,
  open,
  onOpenChange,
  mode = 'live',
  onSaveScenarioDraft,
}: EditAllocationDialogProps) {
  const { toast } = useToast();
  const [plannedReservesDollars, setPlannedReservesDollars] = useState('');
  const [allocationCapDollars, setAllocationCapDollars] = useState('');
  const [allocationReason, setAllocationReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateMutation = useUpdateAllocations({
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Allocation updated successfully',
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!company) {
      return;
    }

    setPlannedReservesDollars(centsToDollars(company.planned_reserves_cents).toString());
    setAllocationCapDollars(
      company.allocation_cap_cents !== null
        ? centsToDollars(company.allocation_cap_cents).toString()
        : ''
    );
    setAllocationReason(company.allocation_reason || '');
    setErrors({});
  }, [company]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const plannedReserves = parseFloat(plannedReservesDollars);
    if (isNaN(plannedReserves) || plannedReserves < 0) {
      newErrors['plannedReserves'] = 'Planned reserves must be a non-negative number';
    }

    if (allocationCapDollars) {
      const cap = parseFloat(allocationCapDollars);
      if (isNaN(cap) || cap < 0) {
        newErrors['allocationCap'] = 'Allocation cap must be a non-negative number';
      } else if (cap < plannedReserves) {
        newErrors['allocationCap'] =
          'Allocation cap must be greater than or equal to planned reserves';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!company || !validateForm()) {
      return;
    }

    const updatePayload: UpdateAllocationPayload = {
      company_id: company.company_id,
      planned_reserves_cents: dollarsToCents(parseFloat(plannedReservesDollars)),
      allocation_cap_cents: allocationCapDollars
        ? dollarsToCents(parseFloat(allocationCapDollars))
        : null,
      allocation_reason: allocationReason.trim() || null,
      allocation_version: company.allocation_version,
    };

    if (mode === 'scenario') {
      onSaveScenarioDraft?.(updatePayload);
      toast({
        title: 'Scenario workspace updated',
        description: 'Local edits were saved to the active scenario workspace.',
      });
      onOpenChange(false);
      return;
    }

    updateMutation.mutate(updatePayload);
  };

  if (!company) return null;

  const lastUpdatedLabel = company.last_allocation_at
    ? format(new Date(company.last_allocation_at), 'MMM d, yyyy')
    : 'Never';
  const isPending = mode === 'live' ? updateMutation.isPending : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit Allocation - {company.company_name}</DialogTitle>
          <DialogDescription>
            {mode === 'scenario'
              ? 'Update the scenario workspace for this company. These changes stay local until you save the scenario.'
              : 'Update the live allocation parameters for this company. All amounts are in USD.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-md">
            <div>
              <p className="text-sm text-gray-500">Sector</p>
              <p className="text-sm font-medium">{company.sector}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Stage</p>
              <p className="text-sm font-medium">{company.stage}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Invested Amount</p>
              <p className="text-sm font-medium">
                {formatCents(company.invested_amount_cents, { compact: true })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Deployed Reserves</p>
              <p className="text-sm font-medium text-blue-600">
                {formatCents(company.deployed_reserves_cents, { compact: true })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Allocation Version</p>
              <p className="text-sm font-medium">v{company.allocation_version}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="text-sm font-medium">{lastUpdatedLabel}</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="planned-reserves">
              Planned Reserves <span className="text-red-500">*</span>
            </Label>
            <Input
              id="planned-reserves"
              type="number"
              step="0.01"
              min="0"
              value={plannedReservesDollars}
              onChange={(event) => setPlannedReservesDollars(event.target.value)}
              placeholder="e.g., 1000000"
              className={errors['plannedReserves'] ? 'border-red-500' : ''}
            />
            {errors['plannedReserves'] && (
              <p className="text-sm text-red-500">{errors['plannedReserves']}</p>
            )}
            <p className="text-xs text-gray-500">
              Current: {formatCents(company.planned_reserves_cents)}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="allocation-cap">Allocation Cap (Optional)</Label>
            <Input
              id="allocation-cap"
              type="number"
              step="0.01"
              min="0"
              value={allocationCapDollars}
              onChange={(event) => setAllocationCapDollars(event.target.value)}
              placeholder="e.g., 5000000 (leave empty for no cap)"
              className={errors['allocationCap'] ? 'border-red-500' : ''}
            />
            {errors['allocationCap'] && (
              <p className="text-sm text-red-500">{errors['allocationCap']}</p>
            )}
            <p className="text-xs text-gray-500">
              Current:{' '}
              {company.allocation_cap_cents !== null
                ? formatCents(company.allocation_cap_cents)
                : 'No cap'}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="allocation-reason">Allocation Reason (Optional)</Label>
            <Textarea
              id="allocation-reason"
              value={allocationReason}
              onChange={(event) => setAllocationReason(event.target.value)}
              placeholder="e.g., Strong growth trajectory, strategic reserve for Series B follow-on"
              className="min-h-[80px]"
              maxLength={500}
            />
            <p className="text-xs text-gray-500">{allocationReason.length}/500 characters</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {mode === 'scenario' ? 'Save to Scenario' : isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
