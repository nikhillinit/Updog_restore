/**
 * NumericInput Component Examples
 *
 * This file demonstrates common usage patterns for the NumericInput component.
 * These examples serve as both documentation and visual testing reference.
 */

import { useState } from 'react';
import { NumericInput } from './NumericInput';

/**
 * Example 1: Currency Input
 * Common use case for fund size, capital committed, etc.
 */
export function CurrencyInputExample() {
  const [fundSize, setFundSize] = useState<number | undefined>(50000000);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Currency Input</h3>
      <NumericInput
        label="Fund Size"
        value={fundSize}
        onChange={setFundSize}
        mode="currency"
        min={0}
        help="Enter the total fund size in USD"
        required
      />
      <div className="text-sm text-charcoal/70">
        Current value: {fundSize !== undefined ? `$${fundSize.toLocaleString()}` : 'Not set'}
      </div>
    </div>
  );
}

/**
 * Example 2: Percentage Input
 * For management fees, carry rates, hurdle rates, etc.
 */
export function PercentageInputExample() {
  const [mgmtFee, setMgmtFee] = useState<number | undefined>(2.0);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Percentage Input</h3>
      <NumericInput
        label="Management Fee"
        value={mgmtFee}
        onChange={setMgmtFee}
        mode="percentage"
        min={0}
        max={5}
        step={0.1}
        help="Typically between 1.5% and 2.5%"
      />
      <div className="text-sm text-charcoal/70">
        Current value: {mgmtFee !== undefined ? `${mgmtFee}%` : 'Not set'}
      </div>
    </div>
  );
}

/**
 * Example 3: Generic Number Input
 * For counts, years, multipliers, etc.
 */
export function NumberInputExample() {
  const [fundTerm, setFundTerm] = useState<number | undefined>(10);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Number Input</h3>
      <NumericInput
        label="Fund Term (Years)"
        value={fundTerm}
        onChange={setFundTerm}
        mode="number"
        suffix="years"
        min={1}
        max={15}
        step={1}
        help="Typical fund term is 10 years"
      />
      <div className="text-sm text-charcoal/70">
        Current value: {fundTerm !== undefined ? `${fundTerm} years` : 'Not set'}
      </div>
    </div>
  );
}

/**
 * Example 4: Error State
 * Showing validation errors
 */
export function ErrorStateExample() {
  const [value, setValue] = useState<number | undefined>(undefined);
  const error = value === undefined ? 'This field is required' : undefined;

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Error State</h3>
      <NumericInput
        label="Required Field"
        value={value}
        onChange={setValue}
        mode="currency"
        error={error}
        required
      />
    </div>
  );
}

/**
 * Example 5: Custom Prefix/Suffix
 * For international currencies or special units
 */
export function CustomPrefixSuffixExample() {
  const [euroAmount, setEuroAmount] = useState<number | undefined>(1000000);
  const [weight, setWeight] = useState<number | undefined>(75.5);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Custom Prefix/Suffix</h3>

      <NumericInput
        label="Amount (EUR)"
        value={euroAmount}
        onChange={setEuroAmount}
        prefix="€"
        min={0}
        help="European fund size"
      />

      <NumericInput
        label="Weight"
        value={weight}
        onChange={setWeight}
        suffix="kg"
        min={0}
        step={0.1}
        help="Enter weight in kilograms"
      />
    </div>
  );
}

/**
 * Example 6: Min/Max Validation
 * Demonstrating automatic clamping
 */
export function MinMaxExample() {
  const [hurdle, setHurdle] = useState<number | undefined>(8);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Min/Max Validation</h3>
      <NumericInput
        label="Hurdle Rate"
        value={hurdle}
        onChange={setHurdle}
        mode="percentage"
        min={0}
        max={100}
        step={0.5}
        help="Value will be automatically clamped between 0% and 100%"
      />
      <div className="text-sm text-charcoal/70">
        Try entering values outside the range - they'll be clamped on blur
      </div>
    </div>
  );
}

/**
 * Example 7: Disabled State
 * For read-only or computed values
 */
export function DisabledStateExample() {
  const computedValue = 2500000; // Simulated computed value

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Disabled State</h3>
      <NumericInput
        label="Computed Total"
        value={computedValue}
        onChange={() => {}} // No-op since disabled
        mode="currency"
        disabled
        help="This value is automatically calculated"
      />
    </div>
  );
}

/**
 * Example 8: Decimal Precision
 * For precise financial calculations
 */
export function DecimalPrecisionExample() {
  const [rate, setRate] = useState<number | undefined>(0.0825);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Decimal Precision</h3>
      <NumericInput
        label="Discount Rate"
        value={rate}
        onChange={setRate}
        mode="percentage"
        min={0}
        max={100}
        step={0.0001}
        help="Supports high precision decimal values"
      />
      <div className="text-sm text-charcoal/70 font-mono">
        Raw value: {rate !== undefined ? rate.toFixed(6) : 'Not set'}
      </div>
    </div>
  );
}

/**
 * Example 9: Large Numbers
 * Demonstrating comma formatting with large values
 */
export function LargeNumbersExample() {
  const [aum, setAum] = useState<number | undefined>(2500000000);

  return (
    <div className="max-w-md p-6 space-y-4">
      <h3 className="font-semibold text-lg">Large Numbers</h3>
      <NumericInput
        label="Assets Under Management"
        value={aum}
        onChange={setAum}
        mode="currency"
        min={0}
        help="Automatically formats with commas for readability"
      />
      <div className="text-sm text-charcoal/70">
        Formatted: {aum !== undefined ? `$${aum.toLocaleString()}` : 'Not set'}
        <br />
        Raw: {aum !== undefined ? aum : 'Not set'}
      </div>
    </div>
  );
}

/**
 * Example 10: Form Integration
 * Using multiple NumericInputs in a form context
 */
export function FormIntegrationExample() {
  const [fundName, setFundName] = useState('Press On Ventures Fund III');
  const [fundSize, setFundSize] = useState<number | undefined>(50000000);
  const [mgmtFee, setMgmtFee] = useState<number | undefined>(2.0);
  const [carryRate, setCarryRate] = useState<number | undefined>(20);
  const [fundTerm, setFundTerm] = useState<number | undefined>(10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', {
      fundName,
      fundSize,
      mgmtFee,
      carryRate,
      fundTerm,
    });
  };

  return (
    <div className="max-w-md p-6">
      <h3 className="font-semibold text-lg mb-4">Fund Setup Form</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-poppins font-medium text-sm text-pov-charcoal block mb-2">
            Fund Name <span className="text-pov-error">*</span>
          </label>
          <input
            type="text"
            value={fundName}
            onChange={(e) => setFundName(e.target.value)}
            className="w-full h-11 px-4 py-2 border border-lightGray rounded-md focus:outline-none focus:ring-2 focus:ring-beige focus:border-beige"
            required
          />
        </div>

        <NumericInput
          label="Fund Size"
          value={fundSize}
          onChange={setFundSize}
          mode="currency"
          min={0}
          help="Total committed capital"
          required
        />

        <NumericInput
          label="Management Fee"
          value={mgmtFee}
          onChange={setMgmtFee}
          mode="percentage"
          min={0}
          max={5}
          step={0.1}
          required
        />

        <NumericInput
          label="Carry Rate"
          value={carryRate}
          onChange={setCarryRate}
          mode="percentage"
          min={0}
          max={100}
          step={1}
          required
        />

        <NumericInput
          label="Fund Term"
          value={fundTerm}
          onChange={setFundTerm}
          mode="number"
          suffix="years"
          min={1}
          max={15}
          step={1}
          required
        />

        <button
          type="submit"
          className="w-full h-11 bg-pov-charcoal text-white rounded-md hover:bg-pov-charcoal/90 transition-colors font-poppins font-medium"
        >
          Create Fund
        </button>
      </form>
    </div>
  );
}

/**
 * All Examples Combined (for visual testing)
 */
export function AllExamples() {
  return (
    <div className="min-h-screen bg-pov-gray p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-pov-charcoal mb-8">
          NumericInput Component Examples
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-card">
            <CurrencyInputExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <PercentageInputExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <NumberInputExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <ErrorStateExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <CustomPrefixSuffixExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <MinMaxExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <DisabledStateExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <DecimalPrecisionExample />
          </div>

          <div className="bg-white rounded-lg shadow-card">
            <LargeNumbersExample />
          </div>

          <div className="bg-white rounded-lg shadow-card md:col-span-2">
            <FormIntegrationExample />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AllExamples;
