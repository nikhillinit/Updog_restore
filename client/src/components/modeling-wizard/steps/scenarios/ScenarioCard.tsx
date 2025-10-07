/**
 * Scenario Card Component
 *
 * Individual scenario editor with adjustment controls
 * - Name and description inputs
 * - MOIC multiplier slider
 * - Exit timing delta slider
 * - Loss rate delta slider
 * - Participation rate delta slider
 * - Remove button (except for single scenario)
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { type ScenarioAdjustment } from '@/schemas/modeling-wizard.schemas';

export interface ScenarioCardProps {
  /** Scenario configuration */
  scenario: ScenarioAdjustment;

  /** Update callback */
  onUpdate: (updated: ScenarioAdjustment) => void;

  /** Remove callback */
  onRemove: () => void;

  /** Disable remove button (e.g., only one scenario) */
  disableRemove?: boolean;

  /** Show as base case */
  isBaseCase?: boolean;
}

export function ScenarioCard({
  scenario,
  onUpdate,
  onRemove,
  disableRemove = false,
  isBaseCase = false
}: ScenarioCardProps) {
  const handleFieldChange = <K extends keyof ScenarioAdjustment>(
    field: K,
    value: ScenarioAdjustment[K]
  ) => {
    onUpdate({ ...scenario, [field]: value });
  };

  return (
    <div className={`bg-charcoal-50 rounded-lg p-6 space-y-6 border-2 ${
      isBaseCase ? 'border-pov-blue' : 'border-transparent'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor={`name-${scenario.id}`} className="font-poppins text-charcoal-700">
              Scenario Name *
            </Label>
            <Input
              id={`name-${scenario.id}`}
              value={scenario.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="e.g., Base Case, Optimistic"
              className="mt-2"
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor={`desc-${scenario.id}`} className="font-poppins text-charcoal-700">
              Description (Optional)
            </Label>
            <Textarea
              id={`desc-${scenario.id}`}
              value={scenario.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Briefly describe this scenario..."
              className="mt-2"
              rows={2}
              maxLength={200}
            />
          </div>
        </div>

        {/* Remove Button */}
        {!disableRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="ml-4 text-error hover:bg-error/10"
            title="Remove scenario"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Adjustments */}
      <div className="space-y-6 pt-4 border-t border-charcoal-200">
        <h4 className="font-inter font-semibold text-sm text-pov-charcoal">
          Adjustments
        </h4>

        {/* MOIC Multiplier */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700 text-sm">
              MOIC Multiplier
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {scenario.moicMultiplier.toFixed(2)}x
            </span>
          </div>
          <Slider
            min={0.1}
            max={5.0}
            step={0.1}
            value={[scenario.moicMultiplier]}
            onValueChange={(value) => handleFieldChange('moicMultiplier', value[0])}
            className="mt-2"
          />
          <p className="text-xs text-charcoal-500 mt-2">
            1.0x = no change, 1.5x = 50% higher returns, 0.7x = 30% lower returns
          </p>
        </div>

        {/* Exit Timing Delta */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700 text-sm">
              Exit Timing (Months)
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {scenario.exitTimingDelta > 0 ? '+' : ''}{scenario.exitTimingDelta} months
            </span>
          </div>
          <Slider
            min={-48}
            max={48}
            step={1}
            value={[scenario.exitTimingDelta]}
            onValueChange={(value) => handleFieldChange('exitTimingDelta', value[0])}
            className="mt-2"
          />
          <p className="text-xs text-charcoal-500 mt-2">
            Negative = earlier exits, Positive = later exits
          </p>
        </div>

        {/* Loss Rate Delta */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700 text-sm">
              Loss Rate Adjustment
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {scenario.lossRateDelta > 0 ? '+' : ''}{scenario.lossRateDelta}pp
            </span>
          </div>
          <Slider
            min={-50}
            max={50}
            step={1}
            value={[scenario.lossRateDelta]}
            onValueChange={(value) => handleFieldChange('lossRateDelta', value[0])}
            className="mt-2"
          />
          <p className="text-xs text-charcoal-500 mt-2">
            Percentage point adjustment to portfolio loss rate
          </p>
        </div>

        {/* Participation Rate Delta */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700 text-sm">
              Follow-On Participation
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {scenario.participationRateDelta > 0 ? '+' : ''}{scenario.participationRateDelta}pp
            </span>
          </div>
          <Slider
            min={-50}
            max={50}
            step={1}
            value={[scenario.participationRateDelta]}
            onValueChange={(value) => handleFieldChange('participationRateDelta', value[0])}
            className="mt-2"
          />
          <p className="text-xs text-charcoal-500 mt-2">
            Percentage point adjustment to follow-on participation rate
          </p>
        </div>
      </div>

      {/* Base Case Indicator */}
      {isBaseCase && (
        <div className="pt-4 border-t border-pov-blue/20">
          <p className="text-sm text-pov-blue font-inter">
            Base Case (No adjustments applied)
          </p>
        </div>
      )}
    </div>
  );
}
