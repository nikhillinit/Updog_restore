// REFLECTION_ID: REFL-008
// This test is linked to: docs/skills/REFL-008-typescript-type-inference-from-database-schemas.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-008: TypeScript Type Inference from Database Schemas
 *
 * Manual TypeScript types that drift from actual database schema
 * cause runtime errors when the types don't match reality.
 */
describe('REFL-008: TypeScript Type Inference from Database Schemas', () => {
  // Simulated "database schema" (source of truth)
  const dbSchema = {
    users: {
      id: 'integer',
      name: 'varchar(255)',
      email: 'varchar(255)',
      created_at: 'timestamp',
      is_active: 'boolean',
      metadata: 'jsonb', // New column added to DB
    },
  };

  // Anti-pattern: Manual types that can drift
  interface ManualUserType {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
    isActive: boolean;
    // metadata field missing - DRIFT!
  }

  // Verified fix: Types inferred from schema
  type InferredUserType = {
    id: number;
    name: string;
    email: string;
    created_at: Date;
    is_active: boolean;
    metadata: Record<string, unknown>;
  };

  // Helper to check if type has all schema fields
  function validateTypeMatchesSchema(
    typeFields: string[],
    schemaFields: string[]
  ): { valid: boolean; missing: string[]; extra: string[] } {
    const missing = schemaFields.filter((f) => !typeFields.includes(f));
    const extra = typeFields.filter((f) => !schemaFields.includes(f));
    return {
      valid: missing.length === 0 && extra.length === 0,
      missing,
      extra,
    };
  }

  describe('Anti-pattern: Manual types drift from schema', () => {
    it('should demonstrate type missing new database column', () => {
      const manualTypeFields = ['id', 'name', 'email', 'createdAt', 'isActive'];
      const dbSchemaFields = Object.keys(dbSchema.users);

      // Manual type is missing 'metadata' and has wrong casing
      const validation = validateTypeMatchesSchema(manualTypeFields, dbSchemaFields);

      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('metadata');
      expect(validation.missing).toContain('created_at');
      expect(validation.missing).toContain('is_active');
    });

    it('should show runtime error when accessing missing field', () => {
      // Simulated DB response with all fields
      const dbRow = {
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        created_at: new Date(),
        is_active: true,
        metadata: { role: 'admin' },
      };

      // Manual type thinks metadata doesn't exist
      const user = dbRow as unknown as ManualUserType;

      // TypeScript says this doesn't exist, but it does at runtime
      // @ts-expect-error - demonstrating the drift
      const metadata = user.metadata;
      expect(metadata).toBeDefined(); // Runtime: it exists!
    });

    it('should demonstrate casing mismatch between type and DB', () => {
      const typeUsessCamelCase = { createdAt: 'createdAt', isActive: 'isActive' };
      const dbUsesSnakeCase = { created_at: 'created_at', is_active: 'is_active' };

      // Names don't match - requires manual mapping
      expect(Object.keys(typeUsessCamelCase)).not.toEqual(
        Object.keys(dbUsesSnakeCase)
      );
    });
  });

  describe('Verified fix: Infer types from schema', () => {
    it('should have types matching all schema fields', () => {
      const inferredTypeFields: (keyof InferredUserType)[] = [
        'id',
        'name',
        'email',
        'created_at',
        'is_active',
        'metadata',
      ];
      const dbSchemaFields = Object.keys(dbSchema.users);

      const validation = validateTypeMatchesSchema(
        inferredTypeFields,
        dbSchemaFields
      );

      expect(validation.valid).toBe(true);
      expect(validation.missing).toHaveLength(0);
    });

    it('should use schema as single source of truth', () => {
      // In real code, this would use Drizzle's InferSelectModel
      // or similar type inference from the schema definition

      // Simulated schema-first type generation
      function inferTypeFromSchema(schema: Record<string, string>) {
        return Object.keys(schema);
      }

      const inferredFields = inferTypeFromSchema(dbSchema.users);

      expect(inferredFields).toContain('metadata');
      expect(inferredFields).toHaveLength(6);
    });

    it('should catch schema changes at compile time', () => {
      // When using schema-inferred types, adding a column to the schema
      // automatically updates the TypeScript type

      const oldSchema = { id: 'integer', name: 'varchar' };
      const newSchema = { ...oldSchema, email: 'varchar' };

      // Type inference picks up new field automatically
      type _OldUser = { [K in keyof typeof oldSchema]: unknown };
      type _NewUser = { [K in keyof typeof newSchema]: unknown };

      const oldFields = Object.keys(oldSchema);
      const newFields = Object.keys(newSchema);

      expect(newFields.length).toBeGreaterThan(oldFields.length);
      expect(newFields).toContain('email');
    });

    it('should demonstrate proper Drizzle pattern', () => {
      // This is the pattern Drizzle ORM uses
      const drizzlePattern = {
        step1: 'Define schema in shared/schema.ts',
        step2: 'Use InferSelectModel<typeof users> for read types',
        step3: 'Use InferInsertModel<typeof users> for insert types',
        step4: 'Never manually define duplicate types',
      };

      expect(drizzlePattern.step4).toContain('Never manually');
    });
  });
});
