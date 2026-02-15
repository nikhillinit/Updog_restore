import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateLegacyPipelineProfiles, LEGACY_PIPELINE_KEY } from '@/lib/migrate-legacy-pipeline';

const SAMPLE_PROFILES = [
  {
    id: 'default',
    name: 'Default',
    stages: [
      {
        id: 'seed',
        name: 'Seed',
        roundSize: 3.5,
        valuation: 16,
        valuationType: 'pre' as const,
        esopPct: 20,
        graduationRate: 18,
        exitRate: 20,
        exitValuation: 35,
        monthsToGraduate: 25,
        monthsToExit: 30,
      },
    ],
  },
];

describe('migrateLegacyPipelineProfiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy key to store and removes it', () => {
    localStorage.setItem(LEGACY_PIPELINE_KEY, JSON.stringify(SAMPLE_PROFILES));
    const setPipelineProfiles = vi.fn();

    migrateLegacyPipelineProfiles([], setPipelineProfiles);

    expect(setPipelineProfiles).toHaveBeenCalledTimes(1);
    expect(setPipelineProfiles).toHaveBeenCalledWith(SAMPLE_PROFILES);
    expect(localStorage.getItem(LEGACY_PIPELINE_KEY)).toBeNull();
  });

  it('does not overwrite when store already has data', () => {
    localStorage.setItem(LEGACY_PIPELINE_KEY, JSON.stringify(SAMPLE_PROFILES));
    const setPipelineProfiles = vi.fn();

    migrateLegacyPipelineProfiles(SAMPLE_PROFILES, setPipelineProfiles);

    expect(setPipelineProfiles).not.toHaveBeenCalled();
    // Legacy key is still removed to prevent future re-attempts
    expect(localStorage.getItem(LEGACY_PIPELINE_KEY)).toBeNull();
  });

  it('is a no-op when legacy key is absent', () => {
    const setPipelineProfiles = vi.fn();

    migrateLegacyPipelineProfiles([], setPipelineProfiles);

    expect(setPipelineProfiles).not.toHaveBeenCalled();
  });

  it('removes corrupt legacy data without throwing', () => {
    localStorage.setItem(LEGACY_PIPELINE_KEY, '{{not valid json');
    const setPipelineProfiles = vi.fn();

    expect(() => migrateLegacyPipelineProfiles([], setPipelineProfiles)).not.toThrow();
    expect(setPipelineProfiles).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_PIPELINE_KEY)).toBeNull();
  });

  it('removes legacy key when it contains an empty array', () => {
    localStorage.setItem(LEGACY_PIPELINE_KEY, '[]');
    const setPipelineProfiles = vi.fn();

    migrateLegacyPipelineProfiles([], setPipelineProfiles);

    expect(setPipelineProfiles).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_PIPELINE_KEY)).toBeNull();
  });
});
