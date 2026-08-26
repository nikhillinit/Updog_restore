/**
 * Fund Financials Step
 *
 * Step 4.5: Fund size, organizational expenses, and capital structure
 *
 * Features:
 * - Fund size and org expense inputs with $ prefix
 * - Investment period, GP commitment, cashless split sliders
 * - Management fee configuration with step-down toggle
 * - Live 10-year projection table
 * - Net investable capital calculation
 *
 * Styling:
 * - Gray backgrounds for sections
 * - Zebra-striped projection table
 * - Right-aligned numbers
 * - Generous padding
 */

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { fundFinancialsSchema, type FundFinancialsInput } from '@/schemas/modeling-wizard.schemas';
import { calculateProjections, calculateNetInvestableCapital } from '@/lib/capital-calculations';
import { ProjectionTable } from './fund-financials/ProjectionTable';
import { ExpenseList } from './fund-financials/ExpenseList';
import { CapitalCallSchedule } from './fund-financials/CapitalCallSchedule';

// ============================================================================
// TYPES
// ============================================================================

export interface FundFinancialsStepProps {
  initialData?: Partial<FundFinancialsInput>;
  onSave: (data: FundFinancialsInput) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FundFinancialsStep({ initialData, onSave }: FundFinancialsStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors }
  } = useForm<FundFinancialsInput>({
    resolver: zodResolver(fundFinancialsSchema),
    defaultValues: initialData || {
      fundSize: 100,
      orgExpenses: 0.5,
      additionalExpenses: [],
      investmentPeriod: 5,
      gpCommitment: 2.0,
      cashlessSplit: 50,
      managementFee: {
        rate: 2.0,
        stepDown: { enabled: false }
      },
      capitalCallSchedule: {
        type: 'even'
      }
    }
  });

  // Watch form values for real-time updates
  const fundSize = watch('fundSize');
  const orgExpenses = watch('orgExpenses');
  const additionalExpenses = watch('additionalExpenses');
  const additionalExpensesList = React.useMemo(
    () => additionalExpenses ?? [],
    [additionalExpenses]
  );
  const investmentPeriod = watch('investmentPeriod');
  const gpCommitment = watch('gpCommitment');
  const cashlessSplit = watch('cashlessSplit');
  const managementFeeRate = watch('managementFee.rate');
  const stepDownEnabled = watch('managementFee.stepDown.enabled') ?? false;
  const stepDownYear = watch('managementFee.stepDown.afterYear');
  const stepDownRate = watch('managementFee.stepDown.newRate');
  const scheduleType = watch('capitalCallSchedule.type') || 'even';
  const customSchedule = watch('capitalCallSchedule.customSchedule');

  // Collapsible state
  const [expensesOpen, setExpensesOpen] = React.useState(false);

  // Calculate projections
  const projections = React.useMemo(() => {
    // Filter out undefined optional properties to satisfy exactOptionalPropertyTypes
    const safeExpenses = additionalExpensesList.map(exp => ({
      id: exp.id,
      name: exp.name,
      amount: exp.amount,
      ...(exp.type !== undefined ? { type: exp.type } : {}),
      ...(exp.description !== undefined ? { description: exp.description } : {}),
      ...(exp.year !== undefined ? { year: exp.year } : {})
    }));

    return calculateProjections({
      targetFundSize: fundSize,
      investmentPeriod,
      gpCommitment,
      cashlessSplit,
      managementFeeRate,
      stepDownEnabled,
      ...(stepDownYear !== undefined ? { stepDownYear } : {}),
      ...(stepDownRate !== undefined ? { stepDownRate } : {}),
      ...(scheduleType !== undefined ? { scheduleType } : {}),
      ...(customSchedule !== undefined ? { customSchedule } : {}),
      additionalExpenses: safeExpenses
    });
  }, [
    fundSize,
    investmentPeriod,
    gpCommitment,
    cashlessSplit,
    managementFeeRate,
    stepDownEnabled,
    stepDownYear,
    stepDownRate,
    scheduleType,
    customSchedule,
    additionalExpensesList
  ]);

  // Calculate net investable capital
  const netInvestableCapital = React.useMemo(() => {
    return calculateNetInvestableCapital(fundSize, orgExpenses, projections);
  }, [fundSize, orgExpenses, projections]);

  // Auto-save on form changes
  React.useEffect(() => {
    const subscription = watch((value) => {
      fundFinancialsSchema.safeParse(value).success && onSave(value as FundFinancialsInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Fund Structure Section */}
      <div className="space-y-6 bg-charcoal-50 rounded-lg p-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Fund Structure
        </h3>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label htmlFor="fundSize" className="font-poppins text-charcoal-700">
              Target Fund Size ($M) *
            </Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500 font-poppins">
                $
              </span>
              <Input
                id="fundSize"
                type="number"
                step="0.01"
                {...register('fundSize', { valueAsNumber: true })}
                placeholder="100.00"
                className="pl-7"
              />
            </div>
            {errors.fundSize && (
              <p className="text-sm text-error mt-1">{errors.fundSize.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="orgExpenses" className="font-poppins text-charcoal-700">
              Organization Expense ($M) *
            </Label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500 font-poppins">
                $
              </span>
              <Input
                id="orgExpenses"
                type="number"
                step="0.01"
                {...register('orgExpenses', { valueAsNumber: true })}
                placeholder="0.50"
                className="pl-7"
              />
            </div>
            {errors.orgExpenses && (
              <p className="text-sm text-error mt-1">{errors.orgExpenses.message}</p>
            )}
          </div>
        </div>

        {/* Investment Period Slider */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700">
              Investment Period (Years) *
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {investmentPeriod} years
            </span>
          </div>
          <Controller
            name="investmentPeriod"
            control={control}
            render={({ field }) => (
              <Slider
                min={1}
                max={10}
                step={1}
                value={[field.value]}
                onValueChange={(value) => field.onChange(value[0])}
                className="mt-2"
              />
            )}
          />
          {errors.investmentPeriod && (
            <p className="text-sm text-error mt-1">{errors.investmentPeriod.message}</p>
          )}
        </div>

        {/* GP Commitment Slider */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700">
              GP Commitment (%) *
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {gpCommitment.toFixed(1)}%
            </span>
          </div>
          <Controller
            name="gpCommitment"
            control={control}
            render={({ field }) => (
              <Slider
                min={0}
                max={10}
                step={0.1}
                value={[field.value]}
                onValueChange={(value) => field.onChange(value[0])}
                className="mt-2"
              />
            )}
          />
          {errors.gpCommitment && (
            <p className="text-sm text-error mt-1">{errors.gpCommitment.message}</p>
          )}
        </div>

        {/* Cashless Split Slider */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <Label className="font-poppins text-charcoal-700">
              Cashless Split (%) *
            </Label>
            <span className="font-inter font-bold text-pov-charcoal">
              {cashlessSplit.toFixed(0)}%
            </span>
          </div>
          <Controller
            name="cashlessSplit"
            control={control}
            render={({ field }) => (
              <Slider
                min={0}
                max={100}
                step={1}
                value={[field.value]}
                onValueChange={(value) => field.onChange(value[0])}
                className="mt-2"
              />
            )}
          />
          {errors.cashlessSplit && (
            <p className="text-sm text-error mt-1">{errors.cashlessSplit.message}</p>
          )}
        </div>
      </div>

      {/* Additional Expenses Section (Collapsible) */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <div className="space-y-4 bg-charcoal-50 rounded-lg p-6">
          <CollapsibleTrigger className="flex items-center justify-between w-full group">
            <h3 className="font-inter font-bold text-lg text-pov-charcoal">
              Additional Expenses (Optional)
            </h3>
            <ChevronDown
              className={`w-5 h-5 text-charcoal-600 transition-transform ${
                expensesOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="pt-4">
              <ExpenseList
                expenses={(additionalExpenses ?? []).map(exp => ({
                  id: exp.id,
                  name: exp.name,
                  amount: exp.amount,
                  ...(exp.type !== undefined ? { type: exp.type } : {}),
                  ...(exp.description !== undefined ? { description: exp.description } : {}),
                  ...(exp.year !== undefined ? { year: exp.year } : {})
                }))}
                onChange={(expenses) => setValue('additionalExpenses', expenses)}
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Capital Call Schedule Section */}
      <div className="space-y-6 bg-charcoal-50 rounded-lg p-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Capital Call Schedule
        </h3>
        <CapitalCallSchedule
          scheduleType={scheduleType}
          investmentPeriod={investmentPeriod}
          {...(customSchedule !== undefined ? { customSchedule } : {})}
          onChange={(type, custom) => {
            setValue('capitalCallSchedule.type', type);
            if (custom) {
              setValue('capitalCallSchedule.customSchedule', custom);
            }
          }}
        />
      </div>

      {/* Management Fee Section */}
      <div className="space-y-6 bg-charcoal-50 rounded-lg p-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Management Fee
        </h3>

        <div>
          <Label htmlFor="mgmtFeeRate" className="font-poppins text-charcoal-700">
            Management Fee Rate (%) *
          </Label>
          <Input
            id="mgmtFeeRate"
            type="number"
            step="0.1"
            {...register('managementFee.rate', { valueAsNumber: true })}
            placeholder="2.0"
            className="mt-2"
          />
          {errors.managementFee?.rate && (
            <p className="text-sm text-error mt-1">{errors.managementFee.rate.message}</p>
          )}
        </div>

        {/* Step-Down Toggle */}
        <div className="space-y-4 p-4 bg-white rounded-lg border border-charcoal-200">
          <div className="flex items-center space-x-3">
            <Switch
              id="stepDownEnabled"
              checked={stepDownEnabled}
              onCheckedChange={(checked) => setValue('managementFee.stepDown.enabled', checked)}
            />
            <Label htmlFor="stepDownEnabled" className="cursor-pointer font-poppins text-charcoal-700">
              Enable Fee Step-Down
            </Label>
          </div>

          {stepDownEnabled && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-charcoal-200">
              <div>
                <Label htmlFor="stepDownYear" className="font-poppins text-charcoal-700">
                  After Year
                </Label>
                <Input
                  id="stepDownYear"
                  type="number"
                  {...register('managementFee.stepDown.afterYear', { valueAsNumber: true })}
                  placeholder="5"
                  className="mt-2"
                />
                {errors.managementFee?.stepDown?.afterYear && (
                  <p className="text-sm text-error mt-1">
                    {errors.managementFee.stepDown.afterYear.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="newRate" className="font-poppins text-charcoal-700">
                  New Rate (%)
                </Label>
                <Input
                  id="newRate"
                  type="number"
                  step="0.1"
                  {...register('managementFee.stepDown.newRate', { valueAsNumber: true })}
                  placeholder="1.5"
                  className="mt-2"
                />
                {errors.managementFee?.stepDown?.newRate && (
                  <p className="text-sm text-error mt-1">
                    {errors.managementFee.stepDown.newRate.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 10-Year Projection Table */}
      <div className="space-y-4">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          10-Year Projection
        </h3>
        <ProjectionTable
          projections={projections}
          organizationExpense={orgExpenses}
          netInvestableCapital={netInvestableCapital}
          additionalExpenses={(additionalExpenses ?? []).map(exp => ({
            id: exp.id,
            name: exp.name,
            amount: exp.amount,
            ...(exp.type !== undefined ? { type: exp.type } : {}),
            ...(exp.year !== undefined ? { year: exp.year } : {})
          }))}
        />
      </div>
    </form>
  );
}
