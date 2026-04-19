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
