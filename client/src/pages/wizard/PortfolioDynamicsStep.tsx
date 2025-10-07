/**
 * Portfolio Dynamics Step - Example Wizard Page
 *
 * Demonstrates complete integration of wizard cards with:
 * - Zod validation and error scoping
 * - LiveTotalsAside integration
 * - Error navigation and focus management
 */

import React, { useState, useMemo } from 'react';
import { StageAllocationCard } from '@/components/wizard/cards/StageAllocationCard';
import { GraduationMatrixCard } from '@/components/wizard/cards/GraduationMatrixCard';
import { ExitTimingCard } from '@/components/wizard/cards/ExitTimingCard';
import { ExitValuesCard } from '@/components/wizard/cards/ExitValuesCard';
import { LiveTotalsAside } from '@/components/wizard/LiveTotalsAside';
import {
  stageAllocationSchema,
  graduationRatesSchema,
  exitTimingSchema,
  exitValuesByStageSchema,
} from '@/lib/wizard-schemas';
import {
  zodErrorsToMap,
  pickErrors,
  getFirstError,
  focusFirstError,
  type FieldErrors,
} from '@/lib/validation';
import { computeFeePreview } from '@/lib/fees-wizard';
import { pctOfDollars } from '@/lib/formatting';
import type {
  StageAllocation,
  GraduationRates,
  ExitTiming,
  ExitValuesByStage,
} from '@/lib/wizard-types';
import {
  DEFAULT_STAGE_ALLOCATION,
  DEFAULT_GRADUATION_RATES,
  DEFAULT_EXIT_TIMING,
  DEFAULT_EXIT_VALUES,
} from '@/lib/wizard-types';

interface PortfolioDynamicsState {
  stageAllocation: StageAllocation;
  graduationRates: GraduationRates;
  exitTiming: ExitTiming;
  exitValues: ExitValuesByStage;
}

export function PortfolioDynamicsStep() {
  // State
  const [state, setState] = useState<PortfolioDynamicsState>({
    stageAllocation: DEFAULT_STAGE_ALLOCATION,
    graduationRates: DEFAULT_GRADUATION_RATES,
    exitTiming: DEFAULT_EXIT_TIMING,
    exitValues: DEFAULT_EXIT_VALUES,
  });

  const [errors, setErrors] = useState<FieldErrors>({});

  // Constants (would come from context in real app)
  const committedCapitalUSD = 20_000_000;
  const mgmtFeeEarlyPct = 2.0;
  const mgmtFeeLatePct = 1.5;
  const feeCutoverYear = 6;
  const fundLifeYears = 10;

  // Update field
  const setField = <K extends keyof PortfolioDynamicsState>(
    key: K,
    value: PortfolioDynamicsState[K]
  ) => {
    setState((prev) => ({ ...prev, [key]: value }));
    // Clear errors for this section when user edits
    setErrors((prev) => pickErrors(prev, key));
  };

  // Validate all sections
  const validate = (): boolean => {
    const validationErrors: FieldErrors = {};

    // Validate stage allocation
    const allocResult = stageAllocationSchema.safeParse(state.stageAllocation);
    if (!allocResult.success) {
      const allocErrors = zodErrorsToMap(allocResult.error);
      Object.entries(allocErrors).forEach(([k, v]) => {
        validationErrors[`stageAllocation.${k}`] = v;
      });
    }

    // Validate graduation rates
    const gradResult = graduationRatesSchema.safeParse(state.graduationRates);
    if (!gradResult.success) {
      const gradErrors = zodErrorsToMap(gradResult.error);
      Object.entries(gradErrors).forEach(([k, v]) => {
        validationErrors[`graduationRates.${k}`] = v;
      });
    }

    // Validate exit timing
    const timingResult = exitTimingSchema.safeParse(state.exitTiming);
    if (!timingResult.success) {
      const timingErrors = zodErrorsToMap(timingResult.error);
      Object.entries(timingErrors).forEach(([k, v]) => {
        validationErrors[`exitTiming.${k}`] = v;
      });
    }

    // Validate exit values
    const exitValResult = exitValuesByStageSchema.safeParse(state.exitValues);
    if (!exitValResult.success) {
      const exitValErrors = zodErrorsToMap(exitValResult.error);
      Object.entries(exitValErrors).forEach(([k, v]) => {
        validationErrors[`exitValues.${k}`] = v;
      });
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  // Scoped errors for each card
  const allocErrors = pickErrors(errors, 'stageAllocation');
  const gradErrors = pickErrors(errors, 'graduationRates');
  const timingErrors = pickErrors(errors, 'exitTiming');
  const exitValErrors = pickErrors(errors, 'exitValues');

  // Live totals calculations
  const allocationTotalPct = useMemo(() => {
    return (
      state.stageAllocation.preSeed +
      state.stageAllocation.seed +
      state.stageAllocation.seriesA +
      state.stageAllocation.seriesB +
      state.stageAllocation.seriesC +
      state.stageAllocation.seriesD +
      state.stageAllocation.reserves
    );
  }, [state.stageAllocation]);

  const estimatedAnnualFeesUSD = useMemo(() => {
    const preview = computeFeePreview('committed', {
      committedCapitalUSD,
      fundLifeYears,
      feeCutoverYear,
      mgmtFeeEarlyPct,
      mgmtFeeLatePct,
    });
    return preview.rows[0]?.feeUSD ?? 0;
  }, [committedCapitalUSD]);

  // First error for LiveTotalsAside
  const firstError = getFirstError(errors);
  const firstErrorLabel = firstError?.message;

  const handleFixFirstError = () => {
    if (firstError) {
      focusFirstError(firstError.field);
    }
  };

  // Handle next button
  const handleNext = () => {
    if (validate()) {
      console.log('Validation passed! Moving to next step...');
      console.log('State:', state);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Portfolio Dynamics</h1>
          <p className="mt-2 text-gray-600">
            Configure allocation, graduation rates, exit timing, and expected exit values.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          {/* Main Content */}
          <div className="space-y-6">
            <StageAllocationCard
              committedCapitalUSD={committedCapitalUSD}
              value={state.stageAllocation}
              onChange={(next) => setField('stageAllocation', next)}
              errors={allocErrors}
            />

            <GraduationMatrixCard
              value={state.graduationRates}
              onChange={(next) => setField('graduationRates', next)}
              errors={gradErrors}
            />

            <ExitTimingCard
              value={state.exitTiming}
              onChange={(next) => setField('exitTiming', next)}
              errors={timingErrors}
            />

            <ExitValuesCard
              value={state.exitValues}
              onChange={(next) => setField('exitValues', next)}
              errors={exitValErrors}
              showWeights={false}
            />

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Next: Review
              </button>
            </div>
          </div>

          {/* Right Rail */}
          <LiveTotalsAside
            committedCapitalUSD={committedCapitalUSD}
            allocationTotalPct={allocationTotalPct}
            reservesPct={state.stageAllocation.reserves}
            estimatedAnnualFeesUSD={estimatedAnnualFeesUSD}
            firstErrorLabel={firstErrorLabel}
            onFixFirstError={handleFixFirstError}
          />
        </div>
      </div>
    </div>
  );
}

export default PortfolioDynamicsStep;
