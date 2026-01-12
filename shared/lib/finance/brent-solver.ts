/**
 * Brent's Method Root Finder
 *
 * Robust root finding using Brent's method (combination of bisection, secant, and inverse quadratic interpolation).
 * More reliable than Newton-Raphson for functions with difficult derivatives.
 *
 * Used as a fallback for XIRR when Newton-Raphson fails to converge.
 *
 * @module shared/lib/finance/brent-solver
 */

export interface BrentOptions {
  /** Convergence tolerance (default: 1e-8) */
  tolerance?: number;
  /** Maximum iterations (default: 200) */
  maxIterations?: number;
}

export interface BrentResult {
  /** Root value, or null if not found */
  root: number | null;
  /** Whether the method converged */
  converged: boolean;
  /** Number of iterations used */
  iterations: number;
  /** Final function value at root */
  finalValue: number;
}

/**
 * Find root of f(x) = 0 using Brent's method
 *
 * @param f - Function to find root of
 * @param a - Lower bound (must bracket root with b)
 * @param b - Upper bound (must bracket root with a)
 * @param options - Solver options
 * @returns Root finding result
 *
 * @example
 * ```ts
 * const f = (x: number) => x * x - 2; // Find sqrt(2)
 * const result = brent(f, 0, 2);
 * console.log(result.root); // ~1.414
 * ```
 */
export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  options: BrentOptions = {}
): BrentResult {
  const { tolerance = 1e-8, maxIterations = 200 } = options;

  let fa = f(a);
  let fb = f(b);

  // Check bracketing
  if (fa * fb > 0) {
    return {
      root: null,
      converged: false,
      iterations: 0,
      finalValue: NaN,
    };
  }

  // Ensure |f(a)| >= |f(b)|
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let d = b - a;
  const _e = d; // Part of Brent algorithm, initialized for symmetry
  let mflag = true;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Check convergence
    if (Math.abs(fb) < tolerance || Math.abs(b - a) < tolerance) {
      return {
        root: b,
        converged: true,
        iterations: iter,
        finalValue: fb,
      };
    }

    let s: number;

    // Try inverse quadratic interpolation
    if (fa !== fc && fb !== fc) {
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // Fall back to secant method
      s = b - (fb * (b - a)) / (fb - fa);
    }

    // Conditions for accepting s
    const tmp2 = (3 * a + b) / 4;
    const cond1 = (s < tmp2 && s < b) || (s > tmp2 && s > b);
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < tolerance;
    const cond5 = !mflag && Math.abs(c - d) < tolerance;

    // Use bisection if any condition fails
    if (cond1 || cond2 || cond3 || cond4 || cond5) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f(s);
    d = c;
    c = b;
    fc = fb;

    // Update interval
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    // Ensure |f(a)| >= |f(b)|
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  // Did not converge
  return {
    root: b,
    converged: false,
    iterations: maxIterations,
    finalValue: fb,
  };
}
