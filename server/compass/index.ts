/**
 * Compass - Internal Valuation Sandbox
 * Main entry point
 *
 * ⚠️ DISCLAIMER: This is an internal decision-support tool.
 * Valuations shown are FOR DISCUSSION ONLY and do not represent official marks.
 * Official valuations remain in the existing Excel-based process.
 */

export { default as compassRoutes } from './routes';
export * from './types';
export * from './calculator';

// Re-export for convenience
export {
  calculateSandboxValuation,
  calculateMedianMultiple,
  calculateValuationRange,
  formatValuation,
  calculateMultiple,
} from './calculator';
