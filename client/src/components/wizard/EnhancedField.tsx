/**
 * EnhancedField - Wizard input component with format-specific validation
 *
 * Supports multiple formats:
 * - usd: Whole dollar amounts (rejects decimals)
 * - percent: Percentage values (0-100 scale)
 * - number: Generic numeric input
 * - date: Date input (ISO format)
 * - select: Dropdown selection
 *
 * Features:
 * - Live validation with inline errors
 * - Format-specific parsing and display
 * - Accessible labels and ARIA attributes
 * - Context chips and help text
 */

import React, { useEffect, useId, useState } from 'react';
import { parseUSDStrict, formatUSD, formatPct } from '@/lib/formatting';
import { cn } from '@/lib/utils';

type Format = 'usd' | 'percent' | 'number' | 'date' | 'select';

interface Option {
  value: string;
  label: string;
}

interface EnhancedFieldProps {
  id?: string;
  label?: string;
  value: any;
  onChange: (v: any) => void;

  format?: Format;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: Option[];

  min?: number;
  max?: number;
  step?: number;

  placeholder?: string;
  required?: boolean;
  disabled?: boolean;

  /** UX enhancements */
  helpText?: string;
  contextChip?: string;
  error?: string;

  /** ARIA attributes */
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;

  /** Additional class names */
  className?: string;
}

/** Clamp percentage to 0-100 range */
const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

export function EnhancedField({
  id,
  label,
  value,
  onChange,
  format = 'number',
  type,
  options,
  min,
  max,
  step,
  placeholder,
  required,
  disabled,
  helpText,
  contextChip,
  error,
  className,
  ...aria
}: EnhancedFieldProps) {
  const internalId = useId();
  const inputId = id ?? internalId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  /** Local display state for controlled formatting */
  const [display, setDisplay] = useState<string>('');

  /** Initialize display from value */
  useEffect(() => {
    if (format === 'usd') {
      setDisplay(typeof value === 'number' && value > 0 ? formatUSD(value) : '');
    } else if (format === 'percent') {
      setDisplay(typeof value === 'number' ? String(value) : '');
    } else if (format === 'date') {
      setDisplay(value || '');
    } else {
      setDisplay(value ?? '');
    }
  }, [value, format]);

  const showError = !!error;

  /** Handle input change */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const raw = e.target.value;

    if (format === 'usd') {
      // Allow user to type, but validate on blur
      setDisplay(raw);
      const parsed = parseUSDStrict(raw);
      if (parsed !== null) {
        onChange(parsed);
      }
      return;
    }

    if (format === 'percent') {
      setDisplay(raw);
      const cleaned = raw.replace(/[^\d.]/g, '');
      const n = Number(cleaned);
      if (Number.isFinite(n)) {
        onChange(clampPct(n));
      } else if (raw === '') {
        onChange(0);
      }
      return;
    }

    if (format === 'number') {
      setDisplay(raw);
      const n = Number(raw);
      if (Number.isFinite(n)) {
        // Apply min/max constraints if provided
        let clamped = n;
        if (min !== undefined && clamped < min) clamped = min;
        if (max !== undefined && clamped > max) clamped = max;
        onChange(clamped);
      } else if (raw === '') {
        onChange(undefined);
      }
      return;
    }

    if (format === 'date') {
      onChange(raw);
      setDisplay(raw);
      return;
    }

    if (format === 'select') {
      onChange(raw);
      return;
    }

    // Fallback
    onChange(raw);
  };

  /** Handle blur (format display) */
  const handleBlur = () => {
    if (format === 'usd') {
      const parsed = parseUSDStrict(display ?? '');
      if (parsed !== null) {
        setDisplay(formatUSD(parsed));
      } else {
        setDisplay('');
      }
      return;
    }

    if (format === 'percent') {
      const n = Number(display);
      if (Number.isFinite(n)) {
        setDisplay(String(clampPct(n)));
      }
      return;
    }
  };

  /** Detect decimal input for USD (show error) */
  const hasDecimalInUSD = format === 'usd' && (display ?? '').includes('.');

  /** Select or input element */
  const isSelect = (type === 'select' || format === 'select') && options?.length;

  /** Determine input mode for mobile keyboards */
  const inputMode = format === 'usd' ? 'numeric' : format === 'percent' || format === 'number' ? 'decimal' : undefined;

  /** Combined ARIA describedby */
  const ariaDescribedBy = [
    helpText ? helpId : null,
    error ? errorId : null,
    aria['aria-describedby'],
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </label>
      )}

      {/* Input or Select */}
      <div className="relative">
        {isSelect ? (
          <select
            id={inputId}
            value={value ?? ''}
            onChange={handleChange}
            disabled={disabled}
            required={required}
            aria-label={aria['aria-label']}
            aria-invalid={aria['aria-invalid'] ?? showError}
            aria-describedby={ariaDescribedBy}
            className={cn(
              'w-full h-10 rounded-md border px-3 text-sm outline-none transition-colors',
              'focus:ring-2 focus:ring-offset-1',
              showError
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500',
              disabled && 'bg-gray-50 cursor-not-allowed opacity-60'
            )}
          >
            <option value="">{placeholder ?? 'Select...'}</option>
            {options!.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            type={format === 'date' ? 'date' : 'text'}
            inputMode={inputMode}
            value={display}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-label={aria['aria-label']}
            aria-invalid={aria['aria-invalid'] ?? showError}
            aria-describedby={ariaDescribedBy}
            className={cn(
              'w-full h-10 rounded-md border px-3 text-sm outline-none transition-colors',
              'focus:ring-2 focus:ring-offset-1',
              showError
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500',
              disabled && 'bg-gray-50 cursor-not-allowed opacity-60',
              format === 'number' && 'font-mono tabular-nums'
            )}
          />
        )}
      </div>

      {/* Context Chip (when no error) */}
      {contextChip && !showError && (
        <p id={helpId} className="text-xs text-gray-500">
          {contextChip}
        </p>
      )}

      {/* Help Text (when no error) */}
      {helpText && !showError && (
        <p id={helpId} className="text-xs text-gray-600 leading-relaxed">
          {helpText}
        </p>
      )}

      {/* Error Message */}
      {showError && (
        <p id={errorId} className="text-xs text-red-600 font-medium">
          {hasDecimalInUSD ? 'Whole dollars only (no decimals)' : error}
        </p>
      )}
    </div>
  );
}

export default EnhancedField;
