/**
 * Utility to ensure thrown values are Error instances
 * Converts strings and other values to proper Error objects
 * 
 * @example
 * ```typescript
 * try {
 *   riskyOperation();
 * } catch (err) {
 *   throw asError(err); // Always throws an Error instance
 * }
 * 
 * // Instead of: throw "Something went wrong"
 * throw asError("Something went wrong");
 * 
 * // Instead of: throw { message: "Failed", code: 500 }
 * throw asError({ message: "Failed", code: 500 });
 * ```
 */
export function asError(value: unknown): Error {
  // Already an Error instance
  if (value instanceof Error) {
    return value;
  }

  // String value
  if (typeof value === 'string') {
    return new Error(value);
  }

  // Object with message property
  if (value && typeof value === 'object' && 'message' in value) {
    const error = new Error(String(value.message));
    
    // Preserve additional properties
    Object.keys(value).forEach(key => {
      if (key !== 'message' && key !== 'name' && key !== 'stack') {
        try {
          (error as any)[key] = (value as any)[key];
        } catch {
          // Ignore if property can't be set
        }
      }
    });
    
    return error;
  }

  // Fallback for other types
  return new Error(String(value));
}

/**
 * Type guard to check if a value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (value && typeof value === 'object' && 'message' in value) {
    return String(value.message);
  }
  
  return String(value);
}