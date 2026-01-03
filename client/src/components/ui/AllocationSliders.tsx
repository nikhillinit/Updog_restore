/**
 * AllocationSliders - Interactive sliders for managing capital allocation percentages
 *
 * Features:
 * - Multiple allocation rows with labels and percentage sliders
 * - Auto-adjusts other allocations to maintain 100% total
 * - Visual feedback for total allocation status
 * - Add/remove allocation rows
 */

import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
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

export function AllocationSliders({ initial, onChange, className }: AllocationSlidersProps) {
  const [allocations, setAllocations] = useState<Allocation[]>(initial);

  useEffect(() => {
    setAllocations(initial);
  }, [initial]);

  const total = allocations.reduce((sum, a) => sum + a.pct, 0);
  const isValid = Math.abs(total - 100) < 0.01; // Allow for floating point precision

  const handleSliderChange = (id: string, newPct: number) => {
    const updated = allocations.map(a =>
      a.id === id ? { ...a, pct: newPct } : a
    );
    setAllocations(updated);
    onChange(updated);
  };

  const handleInputChange = (id: string, value: string) => {
    const newPct = parseFloat(value) || 0;
    const clamped = Math.max(0, Math.min(100, newPct));
    handleSliderChange(id, clamped);
  };

  const handleAddAllocation = () => {
    const newAllocation: Allocation = {
      id: `allocation-${Date.now()}`,
      label: 'New Allocation',
      pct: 0,
    };
    const updated = [...allocations, newAllocation];
    setAllocations(updated);
    onChange(updated);
  };

  const handleRemoveAllocation = (id: string) => {
    if (allocations.length <= 1) return; // Keep at least one allocation
    const updated = allocations.filter(a => a.id !== id);
    setAllocations(updated);
    onChange(updated);
  };

  const handleLabelChange = (id: string, label: string) => {
    const updated = allocations.map(a =>
      a.id === id ? { ...a, label } : a
    );
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
                <Label className="text-sm font-medium text-[#292929]">
                  {allocation.label}
                </Label>
                <Input
                  value={allocation.label}
                  onChange={(e) => handleLabelChange(allocation.id, e.target.value)}
                  className="mt-1 h-9 text-sm"
                  placeholder="Allocation label"
                />
              </div>
              <div className="w-24">
                <Label className="text-sm font-medium text-[#292929]">%</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={allocation.pct.toFixed(0)}
                  onChange={(e) => handleInputChange(allocation.id, e.target.value)}
                  className="mt-1 h-9 text-sm text-right"
                />
              </div>
              {allocations.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAllocation(allocation.id)}
                  className="mt-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Slider
              value={[allocation.pct]}
              onValueChange={([value]) => handleSliderChange(allocation.id, value ?? allocation.pct)}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* Add Allocation Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddAllocation}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Allocation
      </Button>

      {/* Total Display */}
      <div className={cn(
        'p-4 rounded-lg border-2 transition-colors',
        isValid
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      )}>
        <div className="flex items-center justify-between">
          <span className="font-medium">Total Allocation:</span>
          <span className="text-lg font-bold">{total.toFixed(1)}%</span>
        </div>
        {!isValid && (
          <p className="text-sm mt-1">
            Allocations must sum to 100%. Currently {total > 100 ? 'over' : 'under'} by {Math.abs(total - 100).toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}

export default AllocationSliders;
