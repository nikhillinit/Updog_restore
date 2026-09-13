import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function Subject(props: ComponentProps<typeof Tooltip>) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip {...props}>
        <TooltipTrigger asChild>
          <button type="button">Metric information</button>
        </TooltipTrigger>
        <TooltipContent>Source explanation</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe('shared tooltip state', () => {
  it('opens with keyboard focus and closes with Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Subject onOpenChange={onOpenChange} />);
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Source explanation');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('preserves caller ownership of controlled state', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<Subject open={false} onOpenChange={onOpenChange} />);
    await user.tab();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    rerender(<Subject open onOpenChange={onOpenChange} />);
    expect(await screen.findByRole('tooltip')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  it('respects defaultOpen', async () => {
    render(<Subject defaultOpen />);
    expect(await screen.findByRole('tooltip')).toBeVisible();
  });
});
