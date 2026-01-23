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
export * from './shares';
