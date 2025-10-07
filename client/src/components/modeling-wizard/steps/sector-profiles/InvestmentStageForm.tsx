/**
 * Investment Stage Form Component
 *
 * Manages individual investment stage cohorts with add/remove functionality.
 * Displays detailed metrics for each financing stage.
 *
 * Features:
 * - Stage dropdown (Pre-Seed through Series E+)
 * - Round size, valuation, ESOP inputs
 * - Graduation, exit, failure rates with validation
 * - Months to graduate/exit inputs
 * - Real-time failure rate calculation
 * - Add/remove stage buttons
 */

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InvestmentStage } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TYPES
// ============================================================================

export type InvestmentStageCohort = {
  id: string;
  stage: InvestmentStage;
  roundSize: number;
  valuation: number;
  esopPercentage: number;
  graduationRate: number;
  exitRate: number;
  failureRate?: number;
  exitValuation: number;
  monthsToGraduate: number;
  monthsToExit: number;
};

export interface InvestmentStageFormProps {
  stages: InvestmentStageCohort[];
  onChange: (stages: InvestmentStageCohort[]) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAGE_OPTIONS: { value: InvestmentStage; label: string }[] = [
  { value: 'pre-seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b', label: 'Series B' },
  { value: 'series-c', label: 'Series C' },
  { value: 'series-d', label: 'Series D' },
  { value: 'series-e-plus', label: 'Series E+' }
];

// ============================================================================
// COMPONENT
// ============================================================================

export function InvestmentStageForm({ stages, onChange }: InvestmentStageFormProps) {
  const addStage = () => {
    const newStage: InvestmentStageCohort = {
      id: `stage-${Date.now()}`,
      stage: 'seed',
      roundSize: 2.0,
      valuation: 10.0,
      esopPercentage: 10.0,
      graduationRate: 50.0,
      exitRate: 10.0,
      failureRate: 40.0,
      exitValuation: 50.0,
      monthsToGraduate: 18,
      monthsToExit: 24
    };
    onChange([...stages, newStage]);
  };

  const removeStage = (id: string) => {
    onChange(stages.filter(s => s.id !== id));
  };

  const updateStage = (id: string, updates: Partial<InvestmentStageCohort>) => {
    onChange(
      stages.map(s => {
        if (s.id !== id) return s;

        const updated = { ...s, ...updates };

        // Auto-calculate failure rate
        if ('graduationRate' in updates || 'exitRate' in updates) {
          updated.failureRate = Math.max(0, 100 - updated.graduationRate - updated.exitRate);
        }

        return updated;
      })
    );
  };

  // Validate rates don't exceed 100%
  const getRateValidation = (stage: InvestmentStageCohort) => {
    const total = stage.graduationRate + stage.exitRate;
    if (total > 100) {
      return {
        isValid: false,
        message: `Graduation (${stage.graduationRate}%) + Exit (${stage.exitRate}%) = ${total}% exceeds 100%`
      };
    }
    return { isValid: true };
  };

  if (stages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 bg-charcoal-50 rounded-lg border-2 border-dashed border-charcoal-200">
          <p className="text-charcoal-600 font-poppins text-sm mb-4">
            No investment stages defined yet
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={addStage}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Investment Stage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stages.map((stage, index) => {
        const validation = getRateValidation(stage);
        const isLastStage = index === stages.length - 1;

        return (
          <div
            key={stage.id}
            className="bg-white rounded-lg border border-charcoal-200 p-6 space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-inter font-bold text-charcoal-600">
                Stage {index + 1}
              </span>
              <div className="flex items-center gap-2">
                {isLastStage && stage.graduationRate > 0 && (
                  <span className="text-xs text-amber-600 font-poppins">
                    ⚠️ Final stage should have 0% graduation
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStage(stage.id)}
                  className="text-error hover:text-error hover:bg-error/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Rate Validation Alert */}
            {!validation.isValid && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validation.message}</AlertDescription>
              </Alert>
            )}

            {/* Investment Stage Dropdown */}
            <div>
              <Label className="font-poppins text-charcoal-700">
                Investment Stage *
              </Label>
              <Select
                value={stage.stage}
                onValueChange={(value) =>
                  updateStage(stage.id, { stage: value as InvestmentStage })
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Round Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="font-poppins text-charcoal-700">
                  Round Size ($M) *
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={stage.roundSize || ''}
                  onChange={(e) => updateStage(stage.id, { roundSize: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  Valuation ($M) *
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={stage.valuation || ''}
                  onChange={(e) => updateStage(stage.id, { valuation: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  ESOP (%) *
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  value={stage.esopPercentage || ''}
                  onChange={(e) => updateStage(stage.id, { esopPercentage: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Rates Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="font-poppins text-charcoal-700">
                  Graduation Rate (%) *
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={stage.graduationRate || ''}
                  onChange={(e) => updateStage(stage.id, { graduationRate: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  Exit Rate (%) *
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={stage.exitRate || ''}
                  onChange={(e) => updateStage(stage.id, { exitRate: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  Failure Rate (%)
                </Label>
                <Input
                  type="number"
                  value={stage.failureRate?.toFixed(1) || '0.0'}
                  disabled
                  className="mt-2 bg-charcoal-50"
                  title="Calculated as 100% - Graduation Rate - Exit Rate"
                />
                <p className="text-xs text-charcoal-600 mt-1">Auto-calculated</p>
              </div>
            </div>

            {/* Exit Valuation & Timing */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="font-poppins text-charcoal-700">
                  Exit Valuation ($M) *
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={stage.exitValuation || ''}
                  onChange={(e) => updateStage(stage.id, { exitValuation: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  Months to Graduate *
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="120"
                  value={stage.monthsToGraduate || ''}
                  onChange={(e) => updateStage(stage.id, { monthsToGraduate: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="font-poppins text-charcoal-700">
                  Months to Exit *
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="180"
                  value={stage.monthsToExit || ''}
                  onChange={(e) => updateStage(stage.id, { monthsToExit: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Add Stage Button */}
      {stages.length < 10 && (
        <Button
          type="button"
          variant="outline"
          onClick={addStage}
          className="w-full gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Another Stage
        </Button>
      )}

      {stages.length >= 10 && (
        <p className="text-sm text-charcoal-600 font-poppins text-center">
          Maximum of 10 stages reached
        </p>
      )}
    </div>
  );
}
