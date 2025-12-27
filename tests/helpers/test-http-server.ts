/**
 * HTTP test harness for middleware and route integration tests.
 */

import type { Express } from 'express';
import request, { type SuperTest, type Test } from 'supertest';
import { flagsRouter } from '../../server/routes/flags';
import { activateKillSwitch } from '../../server/lib/flags';
import {
  createAdminToken as createAdminTokenHelper,
  createCustomToken,
  createReadOnlyToken as createReadOnlyTokenHelper,
  MockTokenRegistry,
  type JWTClaims,
} from './test-auth-helpers';
import {
  FeatureFlagState,
  RateLimitState,
  resetAllState,
  type FeatureFlagConfig,
} from './test-state-manager';
import { buildTestMiddleware } from './test-middleware-builder';
import { registerTestReset } from './test-helpers';

export interface TestHttpServerConfig {
  middleware?: {
    rateLimit?: { enabled: boolean; windowMs?: number; max?: number };
    auth?: { enabled: boolean; devMode?: boolean };
    security?: { helmet?: boolean; cors?: { origins?: string[] } };
  };
  state?: {
    featureFlags?: Record<string, Partial<FeatureFlagConfig>>;
    killSwitchActive?: boolean;
    resetBetweenTests?: boolean;
  };
  routes?: {
    mountFlagRoutes?: boolean;
  };
}

function buildMiddlewareConfig(
  config: TestHttpServerConfig | undefined,
  registry: MockTokenRegistry
) {
  const rateLimitConfig = config?.middleware?.rateLimit;
  const authConfig = config?.middleware?.auth;
  const securityConfig = config?.middleware?.security;

  return {
    rateLimit: rateLimitConfig
      ? {
          enabled: rateLimitConfig.enabled ?? false,
          windowMs: rateLimitConfig.windowMs,
          max: rateLimitConfig.max,
        }
      : undefined,
    auth: authConfig
      ? {
          enabled: authConfig.enabled ?? false,
          devMode: authConfig.devMode,
          registry,
        }
      : undefined,
    security: securityConfig,
  };
}

/**
 * Test HTTP server wrapper for supertest-based integration tests.
 */
export class TestHttpServer {
  private app: Express;
  private tokenRegistry: MockTokenRegistry;
  private flagState: FeatureFlagState;
  private rateLimitState: RateLimitState;

  constructor(config: TestHttpServerConfig = {}) {
    this.tokenRegistry = new MockTokenRegistry();
    this.flagState = new FeatureFlagState();
    this.rateLimitState = new RateLimitState();

    const middlewareConfig = buildMiddlewareConfig(config, this.tokenRegistry);
    this.app = buildTestMiddleware(middlewareConfig);

    if (config.routes?.mountFlagRoutes) {
      this.app.use('/api/flags', flagsRouter);
    }

    const initialFlags = config.state?.featureFlags;
    if (initialFlags) {
      for (const [name, value] of Object.entries(initialFlags)) {
        this.setFeatureFlag(name, value);
      }
    }

    const killSwitchActive = config.state?.killSwitchActive ?? false;
    this.setKillSwitch(killSwitchActive);

    if (config.state?.resetBetweenTests) {
      registerTestReset(() => this.resetState());
    }
  }

  /**
   * Get a supertest request wrapper for the configured app.
   */
  request(): SuperTest<Test> {
    return request(this.app);
  }

  /**
   * Reset feature flags, tokens, and shared test state.
   */
  resetState(): void {
    this.flagState.resetToDefaults();
    this.tokenRegistry.clear();
    this.setKillSwitch(false);
    resetAllState();
  }

  /**
   * Update a feature flag in the in-memory registry.
   */
  setFeatureFlag(name: string, config: Partial<FeatureFlagConfig>): void {
    this.flagState.setFlag(name, config);
  }

  /**
   * Enable or disable the global flag kill switch.
   */
  setKillSwitch(active: boolean): void {
    if (active) {
      activateKillSwitch();
      return;
    }
    delete process.env['FLAGS_DISABLED_ALL'];
  }

  /**
   * Create a custom auth token with the provided claims.
   */
  createAuthToken(claims: Partial<JWTClaims>): string {
    return createCustomToken(this.tokenRegistry, claims);
  }

  /**
   * Create an admin token backed by the mock token registry.
   */
  createAdminToken(): string {
    return createAdminTokenHelper(this.tokenRegistry);
  }

  /**
   * Create a read-only token backed by the mock token registry.
   */
  createReadOnlyToken(): string {
    return createReadOnlyTokenHelper(this.tokenRegistry);
  }

  /**
   * Cleanup any state associated with this server.
   */
  async cleanup(): Promise<void> {
    this.resetState();
  }

  /**
   * Access the underlying Express application.
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Access the mock token registry for direct inspection.
   */
  getTokenRegistry(): MockTokenRegistry {
    return this.tokenRegistry;
  }
}

/**
 * Factory for creating HTTP test servers.
 */
export function createTestHttpServer(config?: TestHttpServerConfig): TestHttpServer {
  return new TestHttpServer(config);
}
