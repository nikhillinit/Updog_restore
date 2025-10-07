/**
 * Projection Table Component
 *
 * Displays 10-year fund financial projections in a zebra-striped table.
 * Shows yearly breakdown of:
 * - Called Capital
 * - GP Commitment (Cash & Cashless)
 * - Management Fees
 * - Cumulative totals
 *
 * Features:
 * - Zebra striping for readability
 * - Right-aligned numbers
 * - Currency formatting
 * - Responsive design
 */

import React from 'react';
import type { YearlyProjection } from '@/lib/capital-calculations';

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectionTableProps {
  projections: YearlyProjection[];
  organizationExpense: number;
  netInvestableCapital: number;
  additionalExpenses?: Array<{
    id: string;
    name: string;
    amount: number;
    type?: 'one-time' | 'annual';
    year?: number;
  }>;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format number as currency (millions)
 */
function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Format percentage
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ProjectionTable({
  projections,
  organizationExpense,
  netInvestableCapital,
  additionalExpenses = []
}: ProjectionTableProps) {
  // Calculate totals
  const totalCalledCapital = projections.reduce((sum, p) => sum + p.calledCapital, 0);
  const totalGpCash = projections.reduce((sum, p) => sum + p.gpCashCommitment, 0);
  const totalGpCashless = projections.reduce((sum, p) => sum + p.gpCashlessCommitment, 0);
  const totalMgmtFees = projections.reduce((sum, p) => sum + p.managementFeeAfterCashless, 0);

  // Calculate total additional expenses
  const totalAdditionalExpenses = additionalExpenses.reduce((sum, expense) => {
    if (expense.type === 'annual') {
      // Annual expenses apply for 10 years
      return sum + (expense.amount * 10);
    } else {
      // One-time expenses
      return sum + expense.amount;
    }
  }, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-charcoal-50 rounded-lg p-4">
          <div className="text-sm font-poppins text-charcoal-600 mb-1">
            Organization Expense
          </div>
          <div className="text-2xl font-inter font-bold text-pov-charcoal">
            {formatMoney(organizationExpense)}M
          </div>
        </div>

        <div className="bg-pov-teal/10 rounded-lg p-4">
          <div className="text-sm font-poppins text-charcoal-600 mb-1">
            Net Investable Capital
          </div>
          <div className="text-2xl font-inter font-bold text-pov-teal">
            {formatMoney(netInvestableCapital)}M
          </div>
        </div>
      </div>

      {/* Projection Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-charcoal-100">
              <th className="px-4 py-3 text-left font-inter font-bold text-sm text-pov-charcoal">
                Year
              </th>
              <th className="px-4 py-3 text-right font-inter font-bold text-sm text-pov-charcoal">
                Called Capital
              </th>
              <th className="px-4 py-3 text-right font-inter font-bold text-sm text-pov-charcoal">
                GP Cash
              </th>
              <th className="px-4 py-3 text-right font-inter font-bold text-sm text-pov-charcoal">
                GP Cashless
              </th>
              <th className="px-4 py-3 text-right font-inter font-bold text-sm text-pov-charcoal">
                Mgmt Fee Rate
              </th>
              <th className="px-4 py-3 text-right font-inter font-bold text-sm text-pov-charcoal">
                Mgmt Fee ($M)
              </th>
            </tr>
          </thead>
          <tbody>
            {projections.map((projection, index) => (
              <tr
                key={projection.year}
                className={index % 2 === 0 ? 'bg-white' : 'bg-charcoal-50'}
              >
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal">
                  {projection.year}
                </td>
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal text-right">
                  {formatMoney(projection.calledCapital)}M
                </td>
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal text-right">
                  {formatMoney(projection.gpCashCommitment)}M
                </td>
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal text-right">
                  {formatMoney(projection.gpCashlessCommitment)}M
                </td>
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal text-right">
                  {formatPercent(projection.managementFeeRate)}
                </td>
                <td className="px-4 py-3 font-poppins text-sm text-pov-charcoal text-right">
                  {formatMoney(projection.managementFeeAfterCashless)}M
                </td>
              </tr>
            ))}

            {/* Totals Row */}
            <tr className="bg-charcoal-200 border-t-2 border-charcoal-300">
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal">
                Total
              </td>
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                {formatMoney(totalCalledCapital)}M
              </td>
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                {formatMoney(totalGpCash)}M
              </td>
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                {formatMoney(totalGpCashless)}M
              </td>
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                —
              </td>
              <td className="px-4 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                {formatMoney(totalMgmtFees)}M
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculation Breakdown */}
      <div className="bg-charcoal-50 rounded-lg p-4 space-y-2">
        <div className="text-sm font-inter font-bold text-pov-charcoal mb-3">
          Net Investable Capital Calculation
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm font-poppins">
          <div className="text-charcoal-600">Total Called Capital:</div>
          <div className="text-right text-pov-charcoal font-medium">
            {formatMoney(totalCalledCapital)}M
          </div>

          <div className="text-charcoal-600">Organization Expense:</div>
          <div className="text-right text-error font-medium">
            - {formatMoney(organizationExpense)}M
          </div>

          <div className="text-charcoal-600">Total Management Fees:</div>
          <div className="text-right text-error font-medium">
            - {formatMoney(totalMgmtFees)}M
          </div>

          <div className="text-charcoal-600">Total GP Cash:</div>
          <div className="text-right text-error font-medium">
            - {formatMoney(totalGpCash)}M
          </div>

          {totalAdditionalExpenses > 0 && (
            <>
              <div className="text-charcoal-600">Additional Expenses:</div>
              <div className="text-right text-error font-medium">
                - {formatMoney(totalAdditionalExpenses)}M
              </div>
            </>
          )}

          <div className="text-charcoal-600 font-bold border-t border-charcoal-300 pt-2">
            Net Investable Capital:
          </div>
          <div className="text-right text-pov-teal font-bold text-lg border-t border-charcoal-300 pt-2">
            {formatMoney(netInvestableCapital)}M
          </div>
        </div>

        {/* Additional Expenses Breakdown */}
        {additionalExpenses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-charcoal-200">
            <div className="text-sm font-inter font-bold text-charcoal-600 mb-2">
              Additional Expenses Detail
            </div>
            <div className="space-y-1">
              {additionalExpenses.map((expense) => (
                <div key={expense.id} className="flex justify-between text-sm font-poppins text-charcoal-600">
                  <span>
                    {expense.name} ({expense.type === 'annual' ? 'Annual' : `Year ${expense.year}`})
                  </span>
                  <span className="font-medium">
                    {formatMoney(expense.amount)}M
                    {expense.type === 'annual' && ' × 10 years'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
