/**
 * Zod schemas for type-safe unit validation
 *
 * These schemas transform raw numbers to branded types with runtime validation,
 * enabling seamless integration with API endpoints and form validation.
 */

import { z } from 'zod';
import {
  asFraction,
  asPercentage,
  asBasisPoints,
  asDollars,
  type Fraction,
  type Percentage,
  type BasisPoints,
  type Dollars,
} from '../units';

// ============================================================================
// Base Schemas with Branded Type Transformation
// ============================================================================

/**
 * Validates and transforms a number to a Fraction (0-1)
 * @example FractionSchema.parse(0.25) => Fraction(0.25)
 */
export const FractionSchema = z
  .number()
  .refine(Number.isFinite, { message: 'Fraction must be finite' })
  .refine((n) => n >= 0 && n <= 1, {
    message: 'Fraction must be between 0 and 1',
  })
  .transform((n) => asFraction(n));

/**
 * Validates and transforms a number to a Percentage (0-100)
 * @example PercentageSchema.parse(25) => Percentage(25)
 */
export const PercentageSchema = z
  .number()
  .refine(Number.isFinite, { message: 'Percentage must be finite' })
  .refine((n) => n >= 0 && n <= 100, {
    message: 'Percentage must be between 0 and 100',
  })
  .transform((n) => asPercentage(n));

/**
 * Validates and transforms a number to Basis Points (0-10000)
 * @example BasisPointsSchema.parse(250) => BasisPoints(250)
 */
export const BasisPointsSchema = z
  .number()
  .refine(Number.isFinite, { message: 'Basis points must be finite' })
  .refine((n) => n >= 0 && n <= 10000, {
    message: 'Basis points must be between 0 and 10000',
  })
  .transform((n) => asBasisPoints(n));

/**
 * Validates and transforms a number to Dollars (non-negative)
 * @example DollarsSchema.parse(1000000) => Dollars(1000000)
 */
export const DollarsSchema = z
  .number()
  .refine(Number.isFinite, { message: 'Dollar amount must be finite' })
  .refine((n) => n >= 0, {
    message: 'Dollar amount must be non-negative',
  })
  .transform((n) => asDollars(n));

// ============================================================================
// Optional Variants
// ============================================================================

export const OptionalFractionSchema = FractionSchema.optional();
export const OptionalPercentageSchema = PercentageSchema.optional();
export const OptionalBasisPointsSchema = BasisPointsSchema.optional();
export const OptionalDollarsSchema = DollarsSchema.optional();

// ============================================================================
// Nullable Variants
// ============================================================================

export const NullableFractionSchema = FractionSchema.nullable();
export const NullablePercentageSchema = PercentageSchema.nullable();
export const NullableBasisPointsSchema = BasisPointsSchema.nullable();
export const NullableDollarsSchema = DollarsSchema.nullable();

// ============================================================================
// Type Exports (for inference)
// ============================================================================

export type FractionInput = z.input<typeof FractionSchema>;
export type FractionOutput = z.output<typeof FractionSchema>;

export type PercentageInput = z.input<typeof PercentageSchema>;
export type PercentageOutput = z.output<typeof PercentageSchema>;

export type BasisPointsInput = z.input<typeof BasisPointsSchema>;
export type BasisPointsOutput = z.output<typeof BasisPointsSchema>;

export type DollarsInput = z.input<typeof DollarsSchema>;
export type DollarsOutput = z.output<typeof DollarsSchema>;

// ============================================================================
// Utility Schemas for Common Use Cases
// ============================================================================

/**
 * Schema for ownership percentage (0-100%)
 */
export const OwnershipPercentageSchema = PercentageSchema;

/**
 * Schema for ownership fraction (0-1)
 */
export const OwnershipFractionSchema = FractionSchema;

/**
 * Schema for carry/management fee as percentage
 */
export const FeePercentageSchema = PercentageSchema;

/**
 * Schema for IRR or return multiple as percentage
 */
export const ReturnPercentageSchema = PercentageSchema;

/**
 * Schema for fund size or investment amount in dollars
 */
export const InvestmentDollarsSchema = DollarsSchema;

/**
 * Schema for valuation or exit value in dollars
 */
export const ValuationDollarsSchema = DollarsSchema;
