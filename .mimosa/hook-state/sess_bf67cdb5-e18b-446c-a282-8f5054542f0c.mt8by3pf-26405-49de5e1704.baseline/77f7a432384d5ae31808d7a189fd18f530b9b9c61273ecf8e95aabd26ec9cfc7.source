import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWizardStepGuard } from '@/hooks/useWizardStepGuard';

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=2', vi.fn()],
}));

function GuardProbe() {
  const guard = useWizardStepGuard();

  return (
    <div>
      <div data-testid="can-step-3">{String(guard.canAccessStep(3))}</div>
      <button type="button" onClick={() => guard.markStepVisited(2)}>
        Mark Step 2
      </button>
    </div>
  );
}

describe('useWizardStepGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('updates accessible steps immediately after marking a step visited', async () => {
    render(<GuardProbe />);

    expect(screen.getByTestId('can-step-3')).toHaveTextContent('false');

    await userEvent.click(screen.getByRole('button', { name: 'Mark Step 2' }));

    expect(screen.getByTestId('can-step-3')).toHaveTextContent('true');
    expect(JSON.parse(sessionStorage.getItem('wizard-visited-steps') ?? '[]')).toContain(2);
  });
});
