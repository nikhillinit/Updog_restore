import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ForecastingPage from '@/pages/forecasting';

describe('ForecastingPage', () => {
  it('renders a deferred legacy-route notice instead of sample forecasting content', () => {
    render(<ForecastingPage />);

    expect(screen.getByRole('heading', { name: /forecasting/i })).toBeInTheDocument();
    expect(screen.getByText(/legacy forecasting route remains deferred/i)).toBeInTheDocument();
    expect(
      screen.getByText(/sample fund summaries, projection charts, and construction-vs-actual comparison tables have been removed/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Projected Fund Performance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Construction vs\. Actual Comparison/i)).not.toBeInTheDocument();
  });
});
