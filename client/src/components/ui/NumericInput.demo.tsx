/**
 * NumericInput Demo Component
 *
 * Quick visual demo to verify component functionality.
 * Can be imported into any page for testing.
 */

import { useState } from 'react';
import { NumericInput } from './NumericInput';
import { spreadIfDefined } from '@/lib/spreadIfDefined';

export function NumericInputDemo() {
  const [currency, setCurrency] = useState<number | undefined>(1000000);
  const [percentage, setPercentage] = useState<number | undefined>(2.5);
  const [years, setYears] = useState<number | undefined>(10);
  const [errorField, setErrorField] = useState<number | undefined>(undefined);

  const error = errorField === undefined ? 'This field is required' : undefined;

  return (
    <div className="min-h-screen bg-pov-gray p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-card p-8">
        <h1 className="text-2xl font-bold text-pov-charcoal mb-6">
          NumericInput Component Demo
        </h1>

        <div className="space-y-6">
          {/* Currency Example */}
          <div>
            <NumericInput
              label="Fund Size"
              value={currency}
              onChange={setCurrency}
              mode="currency"
              min={0}
              help="Try editing - formats with commas on blur"
              required
            />
            <div className="mt-2 text-sm text-charcoal/70 font-mono">
              Value: {currency !== undefined ? currency : 'undefined'}
            </div>
          </div>

          {/* Percentage Example */}
          <div>
            <NumericInput
              label="Management Fee"
              value={percentage}
              onChange={setPercentage}
              mode="percentage"
              min={0}
              max={5}
              step={0.1}
              help="Use arrow keys to increment/decrement"
            />
            <div className="mt-2 text-sm text-charcoal/70 font-mono">
              Value: {percentage !== undefined ? percentage : 'undefined'}
            </div>
          </div>

          {/* Number with Suffix */}
          <div>
            <NumericInput
              label="Fund Term"
              value={years}
              onChange={setYears}
              mode="number"
              suffix="years"
              min={1}
              max={15}
              step={1}
            />
            <div className="mt-2 text-sm text-charcoal/70 font-mono">
              Value: {years !== undefined ? years : 'undefined'}
            </div>
          </div>

          {/* Error State */}
          <div>
            <NumericInput
              label="Required Field"
              value={errorField}
              onChange={setErrorField}
              mode="currency"
              {...spreadIfDefined('error', error)}
              required
            />
            <div className="mt-2 text-sm text-charcoal/70 font-mono">
              Value: {errorField !== undefined ? errorField : 'undefined'}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-8 p-4 bg-pov-gray rounded-md">
            <h2 className="font-semibold mb-2">Current State</h2>
            <pre className="text-xs font-mono">
              {JSON.stringify(
                {
                  currency,
                  percentage,
                  years,
                  errorField,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NumericInputDemo;
