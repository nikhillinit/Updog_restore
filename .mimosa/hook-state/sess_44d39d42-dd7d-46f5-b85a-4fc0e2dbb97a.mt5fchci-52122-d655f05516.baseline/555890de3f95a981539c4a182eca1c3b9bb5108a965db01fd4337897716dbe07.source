/**
 * Type-Safe Recharts Formatter Utilities
 *
 * Provides wrapper functions to create formatters that are compatible with
 * Recharts' Formatter type, which expects optional (undefined-able) parameters.
 *
 * The Recharts Formatter type signature:
 * ```
 * type Formatter<TValue, TName> = (
 *   value: TValue | undefined,
 *   name: TName | undefined,
 *   item: Payload<TValue, TName>,
 *   index: number,
 *   payload: ReadonlyArray<Payload<TValue, TName>>
 * ) => [React.ReactNode, TName] | React.ReactNode;
 * ```
 *
 * @module chart-formatters
 */

import type { ReactNode } from 'react';
import type {
  Formatter,
  NameType,
  Payload,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';

/**
 * Creates a type-safe Recharts formatter that handles undefined values.
 *
 * @param fn - Formatter function that receives guaranteed non-undefined value
 * @param fallback - Optional fallback for undefined values (default: '')
 * @returns A Recharts-compatible Formatter function
 *
 * @example
 * ```tsx
 * // Before (type error)
 * <Tooltip formatter={(value: number) => formatCurrency(value)} />
 *
 * // After (type-safe)
 * <Tooltip formatter={createFormatter(formatCurrency)} />
 * ```
 */
export function createFormatter(
  fn: (value: ValueType) => ReactNode,
  fallback: ReactNode = ''
): Formatter<ValueType, NameType> {
  return (value: ValueType | undefined): ReactNode => {
    if (value === undefined) return fallback;
    return fn(value);
  };
}

/**
 * Creates a tuple-returning formatter [formattedValue, label].
 *
 * @param fn - Formatter function that formats the value
 * @param label - Static label to return as the second tuple element
 * @param fallback - Optional fallback for undefined values (default: '')
 * @returns A Recharts-compatible Formatter function returning [ReactNode, label]
 *
 * @example
 * ```tsx
 * // Before (type error)
 * <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} />
 *
 * // After (type-safe)
 * <Tooltip formatter={createTupleFormatter(formatCurrency, 'Amount')} />
 * ```
 */
export function createTupleFormatter(
  fn: (value: ValueType) => ReactNode,
  label: NameType,
  fallback: ReactNode = ''
): Formatter<ValueType, NameType> {
  return (value: ValueType | undefined): [ReactNode, NameType] => {
    if (value === undefined) return [fallback, label];
    return [fn(value), label];
  };
}

/**
 * Creates a formatter with dynamic label based on name parameter.
 *
 * @param fn - Formatter function that receives value and name, returns [formatted, label]
 * @param fallback - Optional fallback for undefined values (default: '')
 * @returns A Recharts-compatible Formatter function with dynamic labeling
 *
 * @example
 * ```tsx
 * // Before (type error)
 * <Tooltip formatter={(value: number, name: string) => [
 *   formatCurrency(value),
 *   name === 'amount' ? 'Amount' : 'Rate'
 * ]} />
 *
 * // After (type-safe)
 * <Tooltip formatter={createDynamicFormatter((value, name) => [
 *   formatCurrency(value),
 *   name === 'amount' ? 'Amount' : 'Rate'
 * ])} />
 * ```
 */
export function createDynamicFormatter(
  fn: (value: ValueType, name: NameType | undefined) => [ReactNode, NameType],
  fallback: ReactNode = ''
): Formatter<ValueType, NameType> {
  return (value: ValueType | undefined, name: NameType | undefined): [ReactNode, NameType] => {
    if (value === undefined) {
      return [fallback, name ?? ''];
    }
    return fn(value, name);
  };
}

/**
 * Creates a formatter that needs access to the full tooltip payload entry.
 *
 * Use this when the rendered value depends on entry metadata or `payload`.
 */
export function createPayloadFormatter(
  fn: (
    value: ValueType | undefined,
    name: NameType | undefined,
    item: Payload<ValueType, NameType>,
    index: number,
    payload: ReadonlyArray<Payload<ValueType, NameType>>
  ) => [ReactNode, NameType] | ReactNode
): Formatter<ValueType, NameType> {
  return (
    value: ValueType | undefined,
    name: NameType | undefined,
    item: Payload<ValueType, NameType>,
    index: number,
    payload: ReadonlyArray<Payload<ValueType, NameType>>
  ) => fn(value, name, item, index, payload);
}

/**
 * Creates a formatter that uses value as-is with optional string conversion.
 *
 * @param suffix - Optional suffix to append (e.g., '%', 'x')
 * @param prefix - Optional prefix to prepend (e.g., '$')
 * @param decimals - Number of decimal places for number formatting
 * @param fallback - Fallback for undefined values
 * @returns A simple formatting function
 *
 * @example
 * ```tsx
 * <Tooltip formatter={createSimpleFormatter({ suffix: '%', decimals: 2 })} />
 * // Outputs: "12.34%"
 *
 * <Tooltip formatter={createSimpleFormatter({ prefix: '$', suffix: 'M' })} />
 * // Outputs: "$100M"
 * ```
 */
export function createSimpleFormatter(
  options: {
    prefix?: string;
    suffix?: string;
    decimals?: number;
    fallback?: ReactNode;
  } = {}
): Formatter<ValueType, NameType> {
  const { prefix = '', suffix = '', decimals, fallback = '' } = options;

  return (value: ValueType | undefined): ReactNode => {
    if (value === undefined) return fallback;

    let formatted: string;
    if (typeof value === 'number' && decimals !== undefined) {
      formatted = value.toFixed(decimals);
    } else {
      formatted = String(value);
    }

    return `${prefix}${formatted}${suffix}`;
  };
}

/**
 * Type-safe identity formatter that passes through values unchanged.
 * Useful when you just need type compatibility without transformation.
 *
 * @example
 * ```tsx
 * <Tooltip formatter={identityFormatter} />
 * ```
 */
export const identityFormatter: Formatter<ValueType, NameType> = (
  value: ValueType | undefined
): ReactNode => {
  if (value === undefined) return '';
  return String(value);
};
