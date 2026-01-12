/**
 * Brent's Method Root Finder
 *
 * This file re-exports from the canonical shared implementation.
 * Import from '@shared/lib/finance/brent-solver' for new code.
 *
 * @module client/lib/finance/brent-solver
 */

// Re-export everything from shared for backward compatibility
export { brent, type BrentOptions, type BrentResult } from '@shared/lib/finance/brent-solver';
