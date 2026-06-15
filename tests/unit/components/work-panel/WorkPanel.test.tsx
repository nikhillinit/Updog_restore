import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkPanel } from '@/components/work-panel/WorkPanel';

describe('WorkPanel', () => {
  it('renders title, description, and children when open', () => {
    render(
      <WorkPanel open onClose={() => {}} title="Scenario proof" description="Read-only details">
        <p>Panel body</p>
      </WorkPanel>
    );
    expect(screen.getByText('Scenario proof')).toBeInTheDocument();
    expect(screen.getByText('Read-only details')).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <WorkPanel open={false} onClose={() => {}} title="Scenario proof">
        <p>Panel body</p>
      </WorkPanel>
    );
    expect(screen.queryByText('Panel body')).not.toBeInTheDocument();
  });

  it('calls onClose when the close affordance is used', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <WorkPanel open onClose={onClose} title="Scenario proof">
        <p>Panel body</p>
      </WorkPanel>
    );
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
