/**
 * Shared Schemas Index
 * Export all fund modeling schemas and utilities
 */

// Decimal utilities
export * from './decimal-zod';

// Core schemas
export * from './stage-profile';
export * from './fee-profile';
export * from './capital-call-policy';
export * from './waterfall-policy';
export * from './recycling-policy';
export * from './extended-fund-model';

// Portfolio API schemas
export * from './portfolio-route';

// Stage normalization utilities
export * from './parse-stage-distribution';

// Portfolio optimization schemas
export * from './portfolio-optimization';

// Re-export Decimal for convenience
export { Decimal } from 'decimal.js';
