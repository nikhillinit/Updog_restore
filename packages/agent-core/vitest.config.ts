import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Vitest config helper is externally typed
export default mergeConfig(
  baseConfig,
  defineConfig({
    // No overrides needed - using all base config defaults
  })
);
