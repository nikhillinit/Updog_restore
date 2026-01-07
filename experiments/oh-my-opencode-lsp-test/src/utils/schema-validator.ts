// Test file for AST-Grep structural search
// Task: Find all calls to validateSchema() with >2 arguments

export function validateSchema(data: unknown, schema: unknown): boolean {
  // Simple validation
  return true;
}

// Overload with 3 parameters - AST-Grep should find these
export function validateSchemaWithOptions(
  data: unknown,
  schema: unknown,
  options: { strict?: boolean; allowUnknown?: boolean }
): boolean {
  return validateSchema(data, schema);
}

// Usage examples - Some with 2 args, some with 3+
export class SchemaValidator {
  validate(data: unknown): boolean {
    const schema = {};

    // CASE 1: 2 arguments (should NOT match)
    return validateSchema(data, schema);
  }

  validateStrict(data: unknown): boolean {
    const schema = {};

    // CASE 2: 3 arguments (should MATCH - multi-line)
    return validateSchemaWithOptions(data, schema, { strict: true, allowUnknown: false });
  }

  validateCustom(data: unknown, customSchema: unknown): boolean {
    // CASE 3: 3 arguments inline (should MATCH)
    return validateSchemaWithOptions(data, customSchema, { strict: true });
  }

  batchValidate(items: unknown[]): boolean {
    const schema = {};

    // CASE 4: 2 arguments in loop (should NOT match)
    return items.every((item) => validateSchema(item, schema));
  }
}
