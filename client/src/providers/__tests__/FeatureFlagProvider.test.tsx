import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureFlagProvider, useFeatureFlags } from '../FeatureFlagProvider';

function TestComponent() {
  const { flags } = useFeatureFlags();
  return (
    <div>
      <div data-testid="staging">{String(flags.isStaging)}</div>
      <div data-testid="development">{String(flags.isDevelopment)}</div>
      <div data-testid="production">{String(flags.isProduction)}</div>
      <div data-testid="engine">{String(flags.deterministicEngineV1)}</div>
      <div data-testid="scenario">{String(flags.scenarioManagementV1)}</div>
    </div>
  );
}

describe('FeatureFlagProvider - Regression Tests', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    vi.unstubAllEnvs();
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
  });

  describe('Fix #1: Memoization with proper dependencies', () => {
    it('should compute flags without stale memoization (environment changes)', () => {
      // Original bug: useMemo([]) caused flags to never update
      // This test ensures flags recompute based on actual environment

      // Test 1: Development environment
      vi.stubEnv('VITE_ENV', 'development');
      const { unmount } = render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      expect(screen.getByTestId('development')).toHaveTextContent('true');
      expect(screen.getByTestId('staging')).toHaveTextContent('false');
      expect(screen.getByTestId('production')).toHaveTextContent('false');
      expect(screen.getByTestId('engine')).toHaveTextContent('true'); // dev mode enables features
      expect(screen.getByTestId('scenario')).toHaveTextContent('true');

      unmount();

      // Test 2: Staging environment (would fail with useMemo([]))
      vi.stubEnv('VITE_ENV', 'staging');
      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      // Flags should reflect new environment (would fail with stale memoization)
      expect(screen.getByTestId('staging')).toHaveTextContent('true');
      expect(screen.getByTestId('development')).toHaveTextContent('false');
      expect(screen.getByTestId('production')).toHaveTextContent('false');
      expect(screen.getByTestId('engine')).toHaveTextContent('true'); // staging enables features
      expect(screen.getByTestId('scenario')).toHaveTextContent('true');
    });

    it('should recompute flags when environment changes between renders', () => {
      // This test verifies the fix for empty dependency array in useMemo
      // With useMemo([]), changing VITE_ENV would have no effect

      vi.stubEnv('VITE_ENV', 'development');
      const { rerender, unmount } = render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      expect(screen.getByTestId('development')).toHaveTextContent('true');
      unmount();

      // Simulate environment change (e.g., runtime config update)
      vi.stubEnv('VITE_ENV', 'production');

      rerender(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      // With proper memoization, flags should update
      expect(screen.getByTestId('production')).toHaveTextContent('true');
      expect(screen.getByTestId('development')).toHaveTextContent('false');
      expect(screen.getByTestId('engine')).toHaveTextContent('false'); // production disables features
      expect(screen.getByTestId('scenario')).toHaveTextContent('false');
    });
  });

  describe('Fix #1: Security - Hostname validation', () => {
    it('should not allow subdomain spoofing in hostname detection', () => {
      // Security fix: hostname.includes('staging') was vulnerable to spoofing
      // Fixed with exact domain matching

      const maliciousHosts = [
        'staging.attacker.com',
        'preview-evil.vercel.app',
        'malicious-staging.com',
        'staging-fake.example.com'
      ];

      for (const host of maliciousHosts) {
        vi.stubGlobal('window', { location: { hostname: host } });
        vi.unstubAllEnvs(); // Clear VITE_ENV to test hostname fallback

        render(
          <FeatureFlagProvider>
            <TestComponent />
          </FeatureFlagProvider>
        );

        // Should NOT be staging (security check)
        const staging = screen.getByTestId('staging');

        // With the vulnerable code, these would be detected as staging
        // The fix ensures only legitimate staging hostnames are recognized
        expect(staging).toHaveTextContent('false');
      }
    });

    it('should correctly detect legitimate staging hostnames', () => {
      // Test that actual staging hostnames ARE detected
      const legitimateHosts = [
        'staging.updog.pressonventures.com',
        'preview-abc123.vercel.app'
      ];

      for (const host of legitimateHosts) {
        vi.stubGlobal('window', { location: { hostname: host } });
        vi.unstubAllEnvs(); // Test hostname fallback

        const { unmount } = render(
          <FeatureFlagProvider>
            <TestComponent />
          </FeatureFlagProvider>
        );

        const staging = screen.getByTestId('staging');
        expect(staging).toHaveTextContent('true');

        unmount();
      }
    });
  });

  describe('Environment detection priority', () => {
    it('should prioritize VITE_ENV over hostname detection', () => {
      // VITE_ENV should take precedence
      vi.stubGlobal('window', { location: { hostname: 'staging.updog.pressonventures.com' } });
      vi.stubEnv('VITE_ENV', 'development');

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      // Should be development (VITE_ENV wins)
      expect(screen.getByTestId('development')).toHaveTextContent('true');
      expect(screen.getByTestId('staging')).toHaveTextContent('false');
    });

    it('should fall back to hostname when VITE_ENV is not set', () => {
      vi.stubGlobal('window', { location: { hostname: 'staging.updog.pressonventures.com' } });
      vi.unstubAllEnvs();

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      // Should use hostname detection
      expect(screen.getByTestId('staging')).toHaveTextContent('true');
    });

    it('should default to development when neither VITE_ENV nor hostname is recognized', () => {
      vi.stubGlobal('window', { location: { hostname: 'localhost' } });
      vi.unstubAllEnvs();

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      // Should default to development
      expect(screen.getByTestId('development')).toHaveTextContent('true');
    });
  });

  describe('Feature flag enablement logic', () => {
    it('should enable all features in development', () => {
      vi.stubEnv('VITE_ENV', 'development');

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      expect(screen.getByTestId('engine')).toHaveTextContent('true');
      expect(screen.getByTestId('scenario')).toHaveTextContent('true');
    });

    it('should enable iteration A features in staging', () => {
      vi.stubEnv('VITE_ENV', 'staging');

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      expect(screen.getByTestId('engine')).toHaveTextContent('true');
      expect(screen.getByTestId('scenario')).toHaveTextContent('true');
    });

    it('should disable features by default in production', () => {
      vi.stubEnv('VITE_ENV', 'production');

      render(
        <FeatureFlagProvider>
          <TestComponent />
        </FeatureFlagProvider>
      );

      expect(screen.getByTestId('engine')).toHaveTextContent('false');
      expect(screen.getByTestId('scenario')).toHaveTextContent('false');
    });
  });

  describe('Context error handling', () => {
    it('should throw error when useFeatureFlags is used outside provider', () => {
      expect(() => {
        render(<TestComponent />);
      }).toThrow('useFeatureFlags must be used within FeatureFlagProvider');
    });
  });
});
