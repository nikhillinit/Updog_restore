import React, { useState, useEffect, useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface NumericInputProps {
  /** Label text displayed above the input */
  label: string;
  /** Current numeric value (undefined for empty state) */
  value: number | undefined;
  /** Callback when value changes */
  onChange: (value: number | undefined) => void;
  /** Optional suffix text (e.g., '%' for percentages) */
  suffix?: string;
  /** Optional prefix text (e.g., '$' for currency) - defaults to '$' for currency mode */
  prefix?: string;
  /** Minimum allowed value (enforced on blur) */
  min?: number;
  /** Maximum allowed value (enforced on blur) */
  max?: number;
  /** Step increment for arrow keys (default: 1) */
  step?: number;
  /** Help text displayed below input */
  help?: string;
  /** Error message (replaces help text when present) */
  error?: string;
  /** Display mode for common financial patterns */
  mode?: 'currency' | 'percentage' | 'number';
  /** Placeholder text when input is empty */
  placeholder?: string;
  /** Mark field as required (adds asterisk to label) */
  required?: boolean;
  /** Disable the input */
  disabled?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Unified NumericInput component for financial and numeric data entry.
 *
 * Features:
 * - Automatic comma formatting on blur (e.g., 1000000 → 1,000,000)
 * - Clean editing experience (removes commas while typing)
 * - Currency ($), percentage (%), and generic number modes
 * - Min/max value clamping
 * - Accessible with auto-generated IDs and ARIA attributes
 * - Press On brand styling with focus states
 * - Mobile-optimized with inputMode="decimal"
 * - Tabular nums and monospace font for financial accuracy
 *
 * @example
 * // Currency input
 * <NumericInput
 *   label="Fund Size"
 *   value={fundSize}
 *   onChange={setFundSize}
 *   mode="currency"
 *   min={0}
 * />
 *
 * @example
 * // Percentage input
 * <NumericInput
 *   label="Management Fee"
 *   value={mgmtFee}
 *   onChange={setMgmtFee}
 *   mode="percentage"
 *   min={0}
 *   max={100}
 *   step={0.1}
 * />
 */
export function NumericInput({
  label,
  value,
  onChange,
  suffix,
  prefix,
  min,
  max,
  step = 1,
  help,
  error,
  mode = 'number',
  placeholder,
  required = false,
  disabled = false,
  className,
}: NumericInputProps) {
  // Generate stable unique ID for accessibility
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();

  // Track focus state for formatting behavior
  const [isFocused, setIsFocused] = useState(false);
  // Display value tracks the formatted string shown in the input
  const [displayValue, setDisplayValue] = useState('');

  // Determine prefix/suffix based on mode
  const effectivePrefix = mode === 'currency' ? (prefix ?? '$') : prefix;
  const effectiveSuffix = mode === 'percentage' ? '%' : suffix;

  /**
   * Format a number with thousand separators (commas)
   * Used when input loses focus for better readability
   */
  const formatWithCommas = (num: number): string => {
    return num.toLocaleString('en-US', {
      maximumFractionDigits: 20, // Preserve all decimal places
      useGrouping: true,
    });
  };

  /**
   * Parse a string to a number, handling commas and edge cases
   */
  const parseNumericValue = (str: string): number | undefined => {
    if (!str || str === '' || str === '-') return undefined;
    const cleaned = str.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  };

  /**
   * Clamp a value between min and max bounds
   */
  const clampValue = (val: number | undefined): number | undefined => {
    if (val === undefined) return undefined;
    let clamped = val;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    return clamped;
  };

  // Sync display value with prop value when not focused
  useEffect(() => {
    if (!isFocused) {
      if (value === undefined) {
        setDisplayValue('');
      } else {
        setDisplayValue(formatWithCommas(value));
      }
    }
  }, [value, isFocused]);

  /**
   * Handle input changes - allow typing without formatting
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Allow empty, minus sign, numbers, commas, and decimal point
    // This regex validates as user types
    if (newValue === '' || /^-?[\d,]*\.?\d*$/.test(newValue)) {
      setDisplayValue(newValue);

      // Parse and send to parent (without clamping while typing)
      const parsed = parseNumericValue(newValue);
      onChange(parsed);
    }
  };

  /**
   * Handle focus - strip commas for easier editing
   */
  const handleFocus = () => {
    setIsFocused(true);
    if (value !== undefined) {
      // Remove commas for clean editing experience
      setDisplayValue(value.toString());
    }
  };

  /**
   * Handle blur - format with commas and apply clamping
   */
  const handleBlur = () => {
    setIsFocused(false);

    // Parse current display value
    const parsed = parseNumericValue(displayValue);

    // Apply min/max clamping
    const clamped = clampValue(parsed);

    // If value changed due to clamping, notify parent
    if (clamped !== value) {
      onChange(clamped);
    }

    // Format display value
    if (clamped === undefined) {
      setDisplayValue('');
    } else {
      setDisplayValue(formatWithCommas(clamped));
    }
  };

  /**
   * Handle keyboard navigation (arrow keys, enter, escape)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = value ?? 0;
      const delta = e.key === 'ArrowUp' ? step : -step;
      const newValue = clampValue(currentValue + delta);
      onChange(newValue);
    } else if (e.key === 'Escape') {
      // Reset to original value on escape
      if (value !== undefined) {
        setDisplayValue(value.toString());
      } else {
        setDisplayValue('');
      }
      e.currentTarget.blur();
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label with required indicator */}
      <Label
        htmlFor={inputId}
        className="font-poppins font-medium text-sm text-pov-charcoal"
      >
        {label}
        {required && <span className="text-pov-error ml-1">*</span>}
      </Label>

      {/* Input container with prefix/suffix */}
      <div className="relative">
        {/* Prefix (e.g., $) */}
        {effectivePrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/60 font-mono text-sm pointer-events-none select-none">
            {effectivePrefix}
          </span>
        )}

        {/* Main input field */}
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : help ? helpId : undefined}
          className={cn(
            // Base styles
            'w-full h-11 rounded-md border bg-white',
            'font-mono text-sm tabular-nums',
            'transition-all duration-200 ease-out',

            // Padding based on prefix/suffix
            effectivePrefix ? 'pl-8' : 'pl-4',
            effectiveSuffix ? 'pr-8' : 'pr-4',
            'py-2',

            // Focus states (Press On brand)
            'focus:outline-none focus:ring-2 focus:ring-beige focus:border-beige',

            // Error states
            error
              ? 'border-pov-error focus:ring-pov-error/20 focus:border-pov-error'
              : 'border-lightGray hover:border-charcoal/30',

            // Disabled states
            disabled
              ? 'bg-lightGray cursor-not-allowed opacity-60'
              : 'bg-white',

            // Placeholder
            'placeholder:text-charcoal/40',

            // Shadow
            isFocused ? 'shadow-md' : 'shadow-sm'
          )}
        />

        {/* Suffix (e.g., %) */}
        {effectiveSuffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/60 font-mono text-sm pointer-events-none select-none">
            {effectiveSuffix}
          </span>
        )}
      </div>

      {/* Help text or error message */}
      {error && (
        <p id={errorId} className="font-poppins text-xs text-pov-error" role="alert">
          {error}
        </p>
      )}

      {help && !error && (
        <p id={helpId} className="font-poppins text-xs text-charcoal/70">
          {help}
        </p>
      )}
    </div>
  );
}
