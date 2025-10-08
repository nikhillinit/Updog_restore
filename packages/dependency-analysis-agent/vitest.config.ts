import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'path';
import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Override: include only .test.ts (not .spec.ts)
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@povc/agent-core': path.resolve(__dirname, '../agent-core/src'),
      },
    },
  })
);
