// REFLECTION_ID: REFL-004
// This test is linked to: docs/skills/REFL-004-schema-format-backward-compatibility.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-004: Schema Format Backward Compatibility
 *
 * Schema changes to configuration files, APIs, or data formats
 * can break existing consumers if backward compatibility is not maintained.
 */
describe('REFL-004: Schema Format Backward Compatibility', () => {
  // Example schema validator for a configuration format
  interface ConfigSchemaV1 {
    version: 1;
    name: string;
    settings: {
      enabled: boolean;
    };
  }

  interface ConfigSchemaV2 {
    version: 2;
    name: string;
    settings: {
      enabled: boolean;
      mode?: 'basic' | 'advanced'; // New optional field
    };
    metadata?: Record<string, string>; // New optional field
  }

  function parseConfigV1(data: unknown): ConfigSchemaV1 | null {
    const obj = data as Record<string, unknown>;
    if (obj.version !== 1) return null;
    if (typeof obj.name !== 'string') return null;
    const settings = obj.settings as Record<string, unknown>;
    if (typeof settings?.enabled !== 'boolean') return null;
    return data as ConfigSchemaV1;
  }

  function parseConfigV1orV2(
    data: unknown
  ): ConfigSchemaV1 | ConfigSchemaV2 | null {
    const obj = data as Record<string, unknown>;
    if (obj.version !== 1 && obj.version !== 2) return null;
    if (typeof obj.name !== 'string') return null;
    const settings = obj.settings as Record<string, unknown>;
    // 'enabled' is required in both versions
    if (typeof settings?.enabled !== 'boolean') return null;
    return data as ConfigSchemaV1 | ConfigSchemaV2;
  }

  describe('Anti-pattern: Breaking schema changes', () => {
    it('should demonstrate breaking change when field is renamed', () => {
      const v1Config: ConfigSchemaV1 = {
        version: 1,
        name: 'test',
        settings: { enabled: true },
      };

      // Breaking V3: 'enabled' renamed to 'active'
      const brokenV3Config = {
        version: 3,
        name: 'test',
        settings: { active: true }, // 'enabled' renamed - BREAKING!
      };

      // V1 parser works on V1 data
      expect(parseConfigV1(v1Config)).not.toBeNull();

      // V1 parser fails on V3 data because 'enabled' is missing
      expect(parseConfigV1(brokenV3Config)).toBeNull();
    });

    it('should demonstrate breaking change when required field is removed', () => {
      const configMissingRequired = {
        version: 1,
        name: 'test',
        settings: {}, // Missing 'enabled'
      };

      expect(parseConfigV1(configMissingRequired)).toBeNull();
    });
  });

  describe('Verified fix: Additive-only schema changes', () => {
    it('should accept V1 data with V1+V2 parser', () => {
      const v1Config: ConfigSchemaV1 = {
        version: 1,
        name: 'test',
        settings: { enabled: true },
      };

      const result = parseConfigV1orV2(v1Config);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('should accept V2 data with V1+V2 parser', () => {
      const v2Config: ConfigSchemaV2 = {
        version: 2,
        name: 'test',
        settings: { enabled: true, mode: 'advanced' },
        metadata: { author: 'test' },
      };

      const result = parseConfigV1orV2(v2Config);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(2);
    });

    it('should accept V2 data without optional fields', () => {
      // V2 with only required fields (backward compatible with V1 structure)
      const v2ConfigMinimal: ConfigSchemaV2 = {
        version: 2,
        name: 'test',
        settings: { enabled: false },
        // mode and metadata omitted
      };

      const result = parseConfigV1orV2(v2ConfigMinimal);
      expect(result).not.toBeNull();
    });

    it('should demonstrate additive changes are safe', () => {
      // Adding new optional fields never breaks existing consumers
      const configs = [
        { version: 1, name: 'a', settings: { enabled: true } },
        { version: 2, name: 'b', settings: { enabled: false } },
        { version: 2, name: 'c', settings: { enabled: true, mode: 'basic' } },
        { version: 2, name: 'd', settings: { enabled: true }, metadata: { x: 'y' } },
      ];

      for (const config of configs) {
        expect(parseConfigV1orV2(config)).not.toBeNull();
      }
    });
  });
});
