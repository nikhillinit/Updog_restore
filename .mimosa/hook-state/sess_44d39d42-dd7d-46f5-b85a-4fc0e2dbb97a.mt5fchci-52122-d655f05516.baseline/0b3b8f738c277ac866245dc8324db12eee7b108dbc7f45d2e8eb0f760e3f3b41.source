import { describe, expect, it } from 'vitest';

import {
  DemoProfileImportBundleSchema,
  DemoProfileSectionOrder,
} from '@shared/contracts/demo-profile-import.contract';
import { parseDemoProfileImportBundle } from '../../../server/services/demo-profile-import-service';
import { buildDemoProfileImportBundle } from '../../fixtures/demo-profile-import-fixture';

function cloneBundle(): unknown {
  return JSON.parse(JSON.stringify(buildDemoProfileImportBundle())) as unknown;
}

describe('demo profile import contract', () => {
  it('accepts a complete sanitized v1 bundle and defaults optional arrays', () => {
    const parsed = DemoProfileImportBundleSchema.safeParse(buildDemoProfileImportBundle());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sanitized).toBe(true);
      expect(DemoProfileSectionOrder.every((section) => section in parsed.data.sections)).toBe(
        true
      );
      expect(parsed.data.sections.portfolioCompanies[0]?.sourceKey).toBe('company:alpha');
    }
  });

  it('rejects unsanitized payloads and unsupported top-level sections', () => {
    const unsanitized = {
      ...buildDemoProfileImportBundle(),
      sanitized: false,
    };
    expect(DemoProfileImportBundleSchema.safeParse(unsanitized).success).toBe(false);

    const withUnsupportedSection = cloneBundle() as Record<string, unknown>;
    const sections = withUnsupportedSection['sections'] as Record<string, unknown>;
    sections['reserveStrategies'] = [];
    expect(DemoProfileImportBundleSchema.safeParse(withUnsupportedSection).success).toBe(false);
  });

  it('rejects raw/private fields without echoing raw values in service errors', () => {
    const invalid = cloneBundle() as Record<string, unknown>;
    const sections = invalid['sections'] as Record<string, unknown>;
    const companies = sections['portfolioCompanies'] as Array<Record<string, unknown>>;
    companies[0]!['originalId'] = 'wire_123_real';
    companies[0]!['description'] = 'C:\\Users\\Private\\real-fund.json';

    expect(() => parseDemoProfileImportBundle(invalid)).toThrow(
      'Demo profile bundle failed validation'
    );

    try {
      parseDemoProfileImportBundle(invalid);
    } catch (error) {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain('wire_123_real');
      expect(serialized).not.toContain('real-fund.json');
    }
  });

  it('rejects direct PII values in otherwise allowed text fields', () => {
    const withPhone = cloneBundle() as Record<string, unknown>;
    const sections = withPhone['sections'] as Record<string, unknown>;
    const deals = sections['dealOpportunities'] as Array<Record<string, unknown>>;
    deals[0]!['sourceNotes'] = 'Call 555-123-4567 about diligence';

    const withTaxId = cloneBundle() as Record<string, unknown>;
    const taxSections = withTaxId['sections'] as Record<string, unknown>;
    const baselines = taxSections['fundBaselines'] as Array<Record<string, unknown>>;
    baselines[0]!['companySnapshots'] = [{ note: '12-3456789' }];

    expect(DemoProfileImportBundleSchema.safeParse(withPhone).success).toBe(false);
    expect(DemoProfileImportBundleSchema.safeParse(withTaxId).success).toBe(false);
  });
});
