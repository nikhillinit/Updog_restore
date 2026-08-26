/**
 * AJV validator for waterfall truth cases JSON schema
 */

import Ajv from 'ajv';
import truthCaseSchema from '../../docs/schemas/waterfall-truth-case.schema.json';

const ajv = new Ajv({ allErrors: true, verbose: true });

// Compile schema once
const validateSchema = ajv.compile(truthCaseSchema);

/**
 * Validate truth cases array against JSON schema
 *
 * @param data - Truth cases data to validate
 * @returns true if valid, throws if invalid
 */
export function validate(data: unknown): boolean {
  const valid = validateSchema(data);

  if (!valid) {
    const errors = validateSchema.errors
      ?.map((err) => `${err.instancePath} ${err.message}`)
      .join('\n');
    throw new Error(`Truth cases schema validation failed:\n${errors}`);
  }

  return true;
}

/**
 * Get validation errors without throwing
 *
 * @param data - Truth cases data to validate
 * @returns Array of error messages, or empty array if valid
 */
export function getValidationErrors(data: unknown): string[] {
  const valid = validateSchema(data);

  if (!valid && validateSchema.errors) {
    return validateSchema.errors.map((err) => `${err.instancePath} ${err.message}`);
  }

  return [];
}
