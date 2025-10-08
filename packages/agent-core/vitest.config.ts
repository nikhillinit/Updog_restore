import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    // No overrides needed - using all base config defaults
  })
);
