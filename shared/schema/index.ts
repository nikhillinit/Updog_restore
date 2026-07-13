/**
 * Database Schema Index
 *
 * Re-exports all schema modules for unified imports.
 * Maintains backward compatibility with existing imports.
 *
 * New code should import directly from specific modules:
 *   import { funds } from '@shared/schema/fund';
 *
 * Legacy imports still work:
 *   import { funds } from '@shared/schema';
 *
 * @module shared/schema
 */

export * from './fund';
export * from './portfolio';
export * from './scenario';
export * from './scenario-case-seed-provenance';
export * from './shares';
export * from './user';
export * from './lp-reporting-evidence';
export * from './operating-objects';
export * from './investment-rounds';
export * from './investment-round-model-overrides';
