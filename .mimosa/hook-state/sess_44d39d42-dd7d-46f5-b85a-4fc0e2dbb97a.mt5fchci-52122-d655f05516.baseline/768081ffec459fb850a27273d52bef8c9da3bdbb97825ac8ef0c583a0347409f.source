/**
 * Centralized Decimal.js configuration.
 *
 * Decimal.set() is GLOBAL -- calling it anywhere mutates the library-wide
 * default for every subsequent `new Decimal(...)`.  This module is the
 * single place where that side-effect is allowed.  All runtime code must
 * import Decimal from here (enforced by ESLint no-restricted-imports).
 *
 * Tests may import 'decimal.js' directly only when they intentionally
 * assert library behavior or temporarily override precision.
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export default Decimal;
