import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWizardStepGuard } from '@/hooks/useWizardStepGuard';

const renderSpy = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=2', vi.fn()],
}));

function GuardProbe() {
  renderSpy();
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
    renderSpy.mockClear();
  });

  it('updates accessible steps immediately after marking a step visited', async () => {
    render(<GuardProbe />);

    expect(screen.getByTestId('can-step-3')).toHaveTextContent('false');

    await userEvent.click(screen.getByRole('button', { name: 'Mark Step 2' }));

    expect(screen.getByTestId('can-step-3')).toHaveTextContent('true');
    expect(JSON.parse(sessionStorage.getItem('wizard-visited-steps') ?? '[]')).toContain(2);
  });

  it('does not rerender when marking an already visited step', async () => {
    sessionStorage.setItem('wizard-visited-steps', JSON.stringify([1, 2]));
    render(<GuardProbe />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark Step 2' }));

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
