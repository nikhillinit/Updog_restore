import { describe, expect, it } from 'vitest';
import { buildContextRailSections } from '@/components/context-rail/context-rail-view-model';

describe('buildContextRailSections', () => {
  it('returns the three canonical sections', () => {
    const sections = buildContextRailSections({});
    expect(sections.map((s) => s.id)).toEqual(['freshness', 'attention', 'activity']);
    for (const section of sections) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.emptyText.length).toBeGreaterThan(0);
    }
  });

  it('populates a freshness item from a valid asOfDate (UTC, no fabrication elsewhere)', () => {
    const sections = buildContextRailSections({ asOfDate: '2026-04-24T00:00:00.000Z' });
    const freshness = sections.find((s) => s.id === 'freshness');
    expect(freshness?.items).toHaveLength(1);
    expect(freshness?.items[0]).toMatchObject({ kind: 'freshness', label: 'Fund metrics' });
    expect(freshness?.items[0]?.detail).toBe('As of Apr 24, 2026');
    // attention/activity stay empty until backends land
    expect(sections.find((s) => s.id === 'attention')?.items).toHaveLength(0);
    expect(sections.find((s) => s.id === 'activity')?.items).toHaveLength(0);
  });

  it('leaves freshness empty when asOfDate is missing or invalid', () => {
    for (const asOfDate of [undefined, null, '', 'not-a-date']) {
      const sections = buildContextRailSections({ asOfDate });
      expect(sections.find((s) => s.id === 'freshness')?.items).toHaveLength(0);
    }
  });
});
