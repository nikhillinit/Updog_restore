import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModernWizardProgress } from '@/components/wizard/ModernWizardProgress';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=5', mockNavigate],
}));

const steps = [
  {
    id: 'fund-basics',
    number: 1,
    title: 'Fund Basics',
    description: 'Fund identity, capital, and economics structure',
  },
  {
    id: 'investment-rounds',
    number: 2,
    title: 'Investment Rounds',
    description: 'Define stages, valuations, and progression rates',
  },
  {
    id: 'distributions',
    number: 5,
    title: 'Exit Recycling',
    description: 'Proceeds recycling configuration',
  },
];

describe('ModernWizardProgress', () => {
  it('renders the compact wizard header without step descriptor copy', () => {
    render(<ModernWizardProgress steps={steps} currentStepId="distributions" />);

    expect(screen.getByRole('heading', { name: 'Fund Construction Wizard' })).toBeInTheDocument();
    expect(screen.getByText('PRESS ON VENTURES')).toBeInTheDocument();
    expect(screen.getByText('Exit Recycling')).toBeInTheDocument();
    expect(screen.queryByText('Proceeds recycling configuration')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Fund identity, capital, and economics structure')
    ).not.toBeInTheDocument();
  });
});
