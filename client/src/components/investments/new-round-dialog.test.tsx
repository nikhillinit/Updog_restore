import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/queryClient';
import NewRoundDialog from './new-round-dialog';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/useCreateRound', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useCreateRound')>();
  return { ...actual, useCreateRound: () => ({ mutate, isPending: false }) };
});

function fill() {
  fireEvent.change(screen.getByLabelText(/round name/i), { target: { value: 'Series A' } });
  fireEvent.change(screen.getByLabelText(/round date/i), { target: { value: '2024-06-01' } });
  fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '25000' } });
}

describe('NewRoundDialog', () => {
  beforeEach(() => mutate.mockReset());

  it('omits deferred fields', () => {
    render(<NewRoundDialog isOpen onOpenChange={() => {}} investmentId={3} fundId={7} />);
    expect(screen.queryByLabelText(/graduation/i)).toBeNull();
    expect(screen.queryByText(/advanced share data/i)).toBeNull();
    expect(screen.queryByText(/post-money/i)).toBeNull();
    expect((screen.getByLabelText(/round date/i) as HTMLInputElement).type).toBe('date');
  });

  it('serializes the form and closes on success', () => {
    const onOpenChange = vi.fn();
    mutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(<NewRoundDialog isOpen onOpenChange={onOpenChange} investmentId={3} fundId={7} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0][0];
    expect(payload).toMatchObject({
      fundId: 7,
      roundName: 'Series A',
      roundDate: '2024-06-01',
      securityType: 'equity',
      currency: 'USD',
      investmentAmount: '25000',
    });
    expect(payload).not.toHaveProperty('supersedesRoundId');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a truthful error and stays open on failure', () => {
    const onOpenChange = vi.fn();
    mutate.mockImplementation((_p, opts) => opts?.onError?.(new ApiError(409, 'x', 'idempotency_key_reused')));
    render(<NewRoundDialog isOpen onOpenChange={onOpenChange} investmentId={3} fundId={7} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /add round/i }));
    expect(screen.getByText(/duplicate submission/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('pre-seeds supersedesRoundId and shows the correcting banner', () => {
    mutate.mockImplementation((_p, opts) => opts?.onSuccess?.());
    render(
      <NewRoundDialog
        isOpen
        onOpenChange={() => {}}
        investmentId={3}
        fundId={7}
        supersedesRound={{ id: 11, roundName: 'Seed', roundDate: '2023-01-01' }}
      />
    );
    expect(screen.getByText(/correcting/i)).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ supersedesRoundId: 11 });
  });
});
