/**
 * AllocationSliders - Interactive sliders for managing capital allocation percentages
 *
 * Features:
 * - Multiple allocation rows with labels and percentage sliders
 * - Auto-adjusts other allocations to maintain 100% total
 * - Visual feedback for total allocation status
 * - Remove allocation rows
 */

import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Allocation {
  id: string;
  label: string;
  pct: number;
}

interface AllocationSlidersProps {
  initial: Allocation[];
  onChange: (allocations: Allocation[]) => void;
  className?: string;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

function rebalanceAllocations(rows: Allocation[], changedId: string, nextPct: number) {
  const changedPct = Math.max(0, Math.min(100, roundPct(nextPct)));
  const others = rows.filter((allocation) => allocation.id !== changedId);

  if (others.length === 0) {
    return rows.map((allocation) => ({ ...allocation, pct: 100 }));
  }

  const remainingPct = roundPct(100 - changedPct);
  const otherTotal = others.reduce((sum, allocation) => sum + allocation.pct, 0);
  let usedPct = 0;

  const rebalancedOthers = others.map((allocation, index) => {
    const nextOtherPct =
      index === others.length - 1
        ? roundPct(remainingPct - usedPct)
        : roundPct(
            otherTotal > 0
              ? (allocation.pct / otherTotal) * remainingPct
              : remainingPct / others.length
          );

    usedPct = roundPct(usedPct + nextOtherPct);
    return { ...allocation, pct: nextOtherPct };
  });

  return rows.map((allocation) =>
    allocation.id === changedId
      ? { ...allocation, pct: changedPct }
      : (rebalancedOthers.find((other) => other.id === allocation.id) ?? allocation)
  );
}

function normalizeAllocations(rows: Allocation[]) {
  if (rows.length === 0) return rows;
  if (rows.length === 1) return rows.map((allocation) => ({ ...allocation, pct: 100 }));

  const total = rows.reduce((sum, allocation) => sum + allocation.pct, 0);
  let usedPct = 0;

  return rows.map((allocation, index) => {
    const pct =
      index === rows.length - 1
        ? roundPct(100 - usedPct)
        : roundPct(total > 0 ? (allocation.pct / total) * 100 : 100 / rows.length);

    usedPct = roundPct(usedPct + pct);
    return { ...allocation, pct };
  });
}

export function AllocationSliders({ initial, onChange, className }: AllocationSlidersProps) {
  const [allocations, setAllocations] = useState<Allocation[]>(initial);

  useEffect(() => {
    setAllocations(initial);
  }, [initial]);

  const total = allocations.reduce((sum, a) => sum + a.pct, 0);
  const isValid = Math.abs(total - 100) < 0.01; // Allow for floating point precision

  const handleSliderChange = (id: string, newPct: number) => {
    const updated = rebalanceAllocations(allocations, id, newPct);
    setAllocations(updated);
    onChange(updated);
  };

  const handleInputChange = (id: string, value: string) => {
    const newPct = parseFloat(value) || 0;
    const clamped = Math.max(0, Math.min(100, newPct));
    handleSliderChange(id, clamped);
  };

  const handleRemoveAllocation = (id: string) => {
    if (allocations.length <= 1) return; // Keep at least one allocation
    const updated = normalizeAllocations(allocations.filter((a) => a.id !== id));
    setAllocations(updated);
    onChange(updated);
  };

  const handleLabelChange = (id: string, label: string) => {
    const updated = allocations.map((a) => (a.id === id ? { ...a, label } : a));
    setAllocations(updated);
    onChange(updated);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Allocation Rows */}
      <div className="space-y-4">
        {allocations.map((allocation) => (
          <div key={allocation.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-sm font-medium text-pov-charcoal">{allocation.label}</Label>
                <Input
                  value={allocation.label}
                  onChange={(e) => handleLabelChange(allocation.id, e.target.value)}
                  aria-label={`${allocation.label || 'Allocation'} label`}
                  className="mt-1 h-9 text-sm"
                  placeholder="Allocation label"
                />
              </div>
              <div className="w-24">
                <Label className="text-sm font-medium text-pov-charcoal">%</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={allocation.pct.toFixed(0)}
                  onChange={(e) => handleInputChange(allocation.id, e.target.value)}
                  aria-label={`${allocation.label || 'Allocation'} allocation percentage`}
                  className="mt-1 h-9 text-sm text-right"
                />
              </div>
              {allocations.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAllocation(allocation.id)}
                  className="mt-6 text-error-dark hover:bg-pov-gray"
                  aria-label={`Remove ${allocation.label || 'allocation'}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Slider
              value={[allocation.pct]}
              onValueChange={([value]) =>
                handleSliderChange(allocation.id, value ?? allocation.pct)
              }
              min={0}
              max={100}
              step={1}
              aria-label={`${allocation.label || 'Allocation'} allocation slider`}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* Total Display */}
      <div
        className={cn(
          'p-4 rounded-lg border-2 transition-colors',
          isValid
            ? 'bg-success/10 border-success/50 text-success-dark'
            : 'bg-warning/10 border-warning/50 text-warning-dark'
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">Total Allocation:</span>
          <span className="text-lg font-bold">{total.toFixed(1)}%</span>
        </div>
        {!isValid && (
          <p className="text-sm mt-1">
            Allocations must sum to 100%. Currently {total > 100 ? 'over' : 'under'} by{' '}
            {Math.abs(total - 100).toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}

export default AllocationSliders;
