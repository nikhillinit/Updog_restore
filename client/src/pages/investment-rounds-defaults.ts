import type { StageData } from '@/components/wizard/StageAccordionRow';
import type { SectorProfile } from '@/components/wizard/SectorProfileSwitcher';

export const DEFAULT_PROFILES: SectorProfile[] = [
  { id: 'default', name: 'Default profile', stagesCount: 5, isDefault: true },
  { id: 'saas', name: 'B2B SaaS', stagesCount: 5, isTemplate: false },
  { id: 'deeptech', name: 'Deep tech / Hardware', stagesCount: 6, isTemplate: false },
  { id: 'consumer', name: 'Consumer social', stagesCount: 4, isTemplate: false },
];

export const DEFAULT_STAGES: StageData[] = [
  {
    id: '1',
    name: 'Pre-Seed',
    roundSize: 0.7,
    valuation: 3.1,
    valuationType: 'Pre',
    esop: 9,
    gradRate: 50,
    monthsToNext: 12,
    exitRate: 5,
  },
  {
    id: '2',
    name: 'Seed',
    roundSize: 2.5,
    valuation: 12.0,
    valuationType: 'Post',
    esop: 10,
    gradRate: 40,
    monthsToNext: 18,
    exitRate: 10,
  },
  {
    id: '3',
    name: 'Series A',
    roundSize: 8.0,
    valuation: 35.0,
    valuationType: 'Pre',
    esop: 10,
    gradRate: 60,
    monthsToNext: 18,
    exitRate: 15,
  },
  {
    id: '4',
    name: 'Series B',
    roundSize: 25.0,
    valuation: 120.0,
    valuationType: 'Pre',
    esop: 5,
    gradRate: 70,
    monthsToNext: 24,
    exitRate: 20,
  },
  {
    id: '5',
    name: 'Series C',
    roundSize: 60.0,
    valuation: 350.0,
    valuationType: 'Pre',
    esop: 5,
    // Terminal stage must stay valid on first render and match store invariants.
    gradRate: 0,
    monthsToNext: 24,
    exitRate: 25,
  },
];

export function cloneDefaultStages(): StageData[] {
  return DEFAULT_STAGES.map((stage) => ({ ...stage }));
}
