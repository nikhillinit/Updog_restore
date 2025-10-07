/**
 * Validation Helper Utilities
 *
 * Tools for working with Zod validation errors in wizard forms.
 */

import type { ZodError } from 'zod';

/**
 * Field error mapping (path → messages)
 */
export type FieldErrors = Record<string, string[]>;

/**
 * Convert ZodError to field error map
 *
 * Maps validation errors to field paths for easy lookup in forms.
 *
 * @param err - Zod validation error
 * @returns Map of field paths to error messages
 *
 * @example
 * const result = schema.safeParse(data);
 * if (!result.success) {
 *   const errors = zodErrorsToMap(result.error);
 *   // errors['stageAllocation.reserves'] = ['Allocations must sum to 100%']
 * }
 */
export function zodErrorsToMap(err: ZodError): FieldErrors {
  const out: FieldErrors = {};

  err.issues.forEach((issue) => {
    const key = issue.path.join('.') || '_root';
    (out[key] ??= []).push(issue.message);
  });

  return out;
}

/**
 * Get first error from field error map
 *
 * Useful for displaying a single "fix this first" message.
 *
 * @param errors - Field error map
 * @returns First error { field, message } or null
 *
 * @example
 * const firstError = getFirstError(errors);
 * if (firstError) {
 *   console.log(`Fix: ${firstError.message}`);
 *   focusField(firstError.field);
 * }
 */
export function getFirstError(errors: FieldErrors): { field: string; message: string } | null {
  const fields = Object.keys(errors);
  if (fields.length === 0) return null;

  const field = fields[0];
  const messages = errors[field];
  const message = messages?.[0] ?? 'Unknown error';

  return { field, message };
}

/**
 * Focus first invalid field
 *
 * Scrolls to and focuses the first field with an error.
 * Useful for "Fix Error" button in LiveTotalsAside.
 *
 * @param fieldPath - Field path (e.g., "stageAllocation.reserves")
 *
 * @example
 * <button onClick={() => focusFirstError('stageAllocation.reserves')}>
 *   Fix Error
 * </button>
 */
export function focusFirstError(fieldPath: string): void {
  // Try to find element by ID (convert dot notation to dash)
  const fieldId = fieldPath.replace(/\./g, '-');
  let element = document.getElementById(fieldId);

  // Fallback: try name attribute
  if (!element) {
    element = document.querySelector(`[name="${fieldPath}"]`);
  }

  // Fallback: try data-field attribute
  if (!element) {
    element = document.querySelector(`[data-field="${fieldPath}"]`);
  }

  if (element) {
    // Scroll into view with smooth behavior
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    // Focus after scroll completes
    setTimeout(() => {
      if (element instanceof HTMLElement) {
        element.focus();
      }
    }, 300);
  }
}

/**
 * Check if field has error
 *
 * @param errors - Field error map
 * @param fieldPath - Field path to check
 * @returns True if field has errors
 */
export function hasFieldError(errors: FieldErrors, fieldPath: string): boolean {
  return !!errors[fieldPath]?.length;
}

/**
 * Get field error message (first message only)
 *
 * @param errors - Field error map
 * @param fieldPath - Field path
 * @returns Error message or undefined
 */
export function getFieldError(errors: FieldErrors, fieldPath: string): string | undefined {
  return errors[fieldPath]?.[0];
}

/**
 * Extract errors for a specific section/prefix
 *
 * Returns only errors whose keys start with the prefix, with the prefix stripped.
 * This allows scoping global validation errors to specific card components.
 *
 * @param all - Complete field error map
 * @param prefix - Section prefix (e.g., "stageAllocation")
 * @returns Scoped error map with prefix removed
 *
 * @example
 * const allErrors = {
 *   'stageAllocation.reserves': ['Must sum to 100%'],
 *   'exitTiming.seed': ['Must be between 1-10']
 * };
 * const allocErrors = pickErrors(allErrors, 'stageAllocation');
 * // allocErrors = { 'reserves': ['Must sum to 100%'] }
 */
export function pickErrors(all: FieldErrors, prefix: string): FieldErrors {
  const out: FieldErrors = {};
  const p = prefix + '.';

  for (const [k, v] of Object.entries(all)) {
    if (k === prefix) {
      // Root-level error for this section
      out['_root'] = v.slice();
    } else if (k.startsWith(p)) {
      // Nested error - strip prefix
      out[k.slice(p.length)] = v.slice();
    }
  }

  return out;
}

/**
 * Get first error string from scoped error map
 *
 * Convenience helper for extracting a single error message from a scoped map.
 *
 * @param scoped - Scoped field error map (from pickErrors)
 * @param key - Field key (without prefix)
 * @returns First error message or undefined
 *
 * @example
 * const scopedErrors = pickErrors(allErrors, 'stageAllocation');
 * const reservesError = firstError(scopedErrors, 'reserves');
 */
export function firstError(scoped: FieldErrors, key: string): string | undefined {
  const arr = scoped[key];
  return Array.isArray(arr) && arr.length ? arr[0] : undefined;
}
