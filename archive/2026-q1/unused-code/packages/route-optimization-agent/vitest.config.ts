import { defineConfig, mergeConfig } from 'vitest/config';
import path from 'path';
import baseConfig from '../../vitest.config.base';

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@agent-core': path.resolve(__dirname, '../agent-core/src'),
      },
    },
  })
);
