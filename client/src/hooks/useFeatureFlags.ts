import { useMemo } from 'react';
import { flags } from '@/flags';

/**
 * React convenience hook to read feature flags.
 * Always prefer importing from '@/flags' in non-React code.
 */
export const useFeatureFlags = () => {
  return useMemo(() => ({ isWizardEnabled: flags.wizard }), []);
};
