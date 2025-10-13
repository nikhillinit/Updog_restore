import { clientEnv } from '@/config.client';

export const flags = Object.freeze({
  /** Feature flags (client-side) */
  wizard: clientEnv.VITE_WIZARD_ENABLED,
});
