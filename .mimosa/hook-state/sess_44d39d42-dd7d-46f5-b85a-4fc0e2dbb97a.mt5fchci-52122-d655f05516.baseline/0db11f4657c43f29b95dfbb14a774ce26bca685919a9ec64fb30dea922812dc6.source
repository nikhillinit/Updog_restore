import type { PipelineProfile } from '@/stores/fundStore';

/** Legacy localStorage key used by Step 4 before store migration */
export const LEGACY_PIPELINE_KEY = 'updog_sector_profiles_with_stages';

/**
 * One-time migration: reads the legacy localStorage key, writes to fundStore's
 * pipelineProfiles slice, and removes the legacy key.
 *
 * No-op if the store already has pipeline data or the legacy key is absent.
 * Always removes the legacy key (even on parse failure) to prevent re-attempts.
 */
export function migrateLegacyPipelineProfiles(
  storeProfiles: PipelineProfile[],
  setPipelineProfiles: (profiles: PipelineProfile[]) => void
): void {
  try {
    const legacy = localStorage.getItem(LEGACY_PIPELINE_KEY);
    if (!legacy) return;

    const parsed: unknown = JSON.parse(legacy);
    if (Array.isArray(parsed) && parsed.length > 0 && storeProfiles.length === 0) {
      setPipelineProfiles(parsed as PipelineProfile[]);
    }
    localStorage.removeItem(LEGACY_PIPELINE_KEY);
  } catch {
    // Corrupt legacy data -- remove it to prevent future re-attempts
    localStorage.removeItem(LEGACY_PIPELINE_KEY);
  }
}
