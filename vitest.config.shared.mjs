import { resolve } from 'node:path';

export function createVitestAlias(projectRoot, options = {}) {
  const {
    includeAppServer = false,
    includeAssets = false,
    includeClientUtils = false,
    includeServerShorthand = false,
    includeTestMocks = false,
    includeUpstashRedisMock = false,
  } = options;

  return {
    '@/core': resolve(projectRoot, './client/src/core'),
    '@/lib': resolve(projectRoot, './client/src/lib'),
    ...(includeClientUtils ? { '@/utils': resolve(projectRoot, './client/src/utils') } : {}),
    ...(includeAppServer ? { '@/server': resolve(projectRoot, './server') } : {}),
    ...(includeTestMocks
      ? {
          '@/metrics/reserves-metrics': resolve(projectRoot, './tests/mocks/metrics-mock.ts'),
          '@/server/utils/logger': resolve(projectRoot, './tests/mocks/server-logger.ts'),
        }
      : {}),
    '@/': resolve(projectRoot, './client/src/'),
    '@': resolve(projectRoot, './client/src'),
    '@shared/': resolve(projectRoot, './shared/'),
    '@shared': resolve(projectRoot, './shared'),
    '@schema': resolve(projectRoot, './shared/schema'),
    ...(includeAssets ? { '@assets': resolve(projectRoot, './assets') } : {}),
    ...(includeServerShorthand ? { '@server': resolve(projectRoot, './server') } : {}),
    ...(includeUpstashRedisMock
      ? { '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts') }
      : {}),
  };
}

export function createQuarantineVitestAlias(projectRoot) {
  return {
    '@': resolve(projectRoot, './client/src'),
    '@/core': resolve(projectRoot, './client/src/core'),
    '@/lib': resolve(projectRoot, './client/src/lib'),
    '@shared': resolve(projectRoot, './shared'),
    '@assets': resolve(projectRoot, './assets'),
    '@server': resolve(projectRoot, './server'),
  };
}
