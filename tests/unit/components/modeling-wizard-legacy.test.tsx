// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelingWizard } from '@/components/modeling-wizard/ModelingWizard';

vi.mock('@/hooks/useModelingWizard', () => ({
  useModelingWizard: vi.fn(() => {
    throw new Error('Legacy wizard hook should not run without explicit opt-in');
  }),
}));

describe('ModelingWizard legacy quarantine', () => {
  it('shows the quarantine notice and canonical fund setup link by default', () => {
    render(<ModelingWizard />);

    expect(screen.getByTestId('legacy-modeling-wizard-notice')).toBeInTheDocument();
    expect(screen.getByText('Legacy wizard UI is quarantined')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Open Fund Setup' });
    expect(link).toHaveAttribute('href', '/fund-setup');
  });
});
