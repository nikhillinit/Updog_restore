import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlagProvider, useFeatureFlags } from '../FeatureFlagProvider';

function TestComponent() {
  const flags = useFeatureFlags();
  return (
    <div>
      <div data-testid="staging">{String(flags.isStaging)}</div>
      <div data-testid="development">{String(flags.isDevelopment)}</div>
      <div data-testid="production">{String(flags.isProduction)}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <FeatureFlagProvider>
      <TestComponent />
    </FeatureFlagProvider>
  );
}

describe('FeatureFlagProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses explicit production deployment metadata', () => {
    vi.stubEnv('VITE_ENV', 'production');
    renderProvider();

    expect(screen.getByTestId('production')).toHaveTextContent('true');
    expect(screen.getByTestId('staging')).toHaveTextContent('false');
  });

  it('uses explicit staging deployment metadata', () => {
    vi.stubEnv('VITE_ENV', 'staging');
    renderProvider();

    expect(screen.getByTestId('staging')).toHaveTextContent('true');
    expect(screen.getByTestId('production')).toHaveTextContent('false');
  });

  it('defaults unknown hosts to development', () => {
    renderProvider();

    expect(screen.getByTestId('development')).toHaveTextContent('true');
  });

  it('requires the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<TestComponent />)).toThrow(
      'useFeatureFlags must be used within FeatureFlagProvider'
    );
    consoleError.mockRestore();
  });
});
