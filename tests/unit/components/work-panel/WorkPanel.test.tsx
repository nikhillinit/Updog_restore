import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  // AMENDMENT 8 pin: the headerSlot/onCloseAutoFocus extension is additive only.
  it('renders an unchanged header when the new optional props are absent', () => {
    render(
      <WorkPanel open onClose={() => {}} title="Scenario proof">
        <p>Panel body</p>
      </WorkPanel>
    );
    const header = screen.getByText('Scenario proof').parentElement;
    expect(header).not.toBeNull();
    expect(header?.children).toHaveLength(1);

    render(
      <WorkPanel open onClose={() => {}} title="Second proof" description="Read-only details">
        <p>Panel body</p>
      </WorkPanel>
    );
    const describedHeader = screen.getByText('Second proof').parentElement;
    expect(describedHeader?.children).toHaveLength(2);
  });

  it('renders headerSlot inside the sheet header after the title row', () => {
    render(
      <WorkPanel
        open
        onClose={() => {}}
        title="Scenario proof"
        description="Read-only details"
        headerSlot={<div data-testid="header-slot">Slot content</div>}
      >
        <p>Panel body</p>
      </WorkPanel>
    );
    const title = screen.getByText('Scenario proof');
    const slot = screen.getByTestId('header-slot');
    expect(slot.parentElement).toBe(title.parentElement);
    expect(title.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('forwards onCloseAutoFocus to the sheet content', async () => {
    const user = userEvent.setup();
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <WorkPanel
          open={open}
          onClose={() => setOpen(false)}
          title="Scenario proof"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <p>Panel body</p>
        </WorkPanel>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled());
  });
});
