import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareConfigModal from '@/components/sharing/ShareConfigModal';
import type { CreateShareLinkRequest } from '@shared/sharing-schema';

vi.mock('@/shared/useFlags', () => ({ useFlag: vi.fn() }));
import { useFlag } from '@/shared/useFlags';

const mockUseFlag = vi.mocked(useFlag);
type ShareCreateResult = { shareUrl: string; shareId: string };

function renderShareConfigModal(
  onCreate = vi.fn().mockResolvedValue({ shareUrl: '/shared/s1', shareId: 'share-1' })
) {
  render(<ShareConfigModal fundId="1" fundName="Fund I" onCreateShare={onCreate} />);
  fireEvent.click(screen.getByRole('button', { name: /share with lps/i }));

  return { onCreate };
}

async function createShareLink() {
  fireEvent.click(screen.getByRole('button', { name: /create share link/i }));
  await waitFor(() => {
    expect(screen.getByText('Share Link Created Successfully')).toBeInTheDocument();
  });
}

describe('ShareConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the snapshot summary when LP snapshot mode is enabled', async () => {
    mockUseFlag.mockReturnValue(true);

    renderShareConfigModal();
    await createShareLink();

    expect(screen.getByText('Immutable snapshot')).toBeInTheDocument();
    expect(screen.getByText('Share ID')).toBeInTheDocument();
    expect(screen.queryByText('Snapshot ID')).not.toBeInTheDocument();
    expect(screen.getByText('share-1')).toBeInTheDocument();
    expect(
      screen.getByText(
        'LPs see a frozen snapshot captured now. Later dashboard changes do not affect this share.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Management Fees')).toBeInTheDocument();
  });

  it('hides the snapshot summary when LP snapshot mode is disabled', async () => {
    mockUseFlag.mockReturnValue(false);

    renderShareConfigModal();
    await createShareLink();

    expect(screen.getByDisplayValue('/shared/s1')).toBeInTheDocument();
    expect(screen.queryByText('Immutable snapshot')).not.toBeInTheDocument();
  });

  it('uses the submitted config for the immutable snapshot summary', async () => {
    mockUseFlag.mockReturnValue(true);
    let resolveCreate: (value: ShareCreateResult) => void = () => undefined;
    const onCreate = vi.fn((_config: CreateShareLinkRequest) => {
      return new Promise<ShareCreateResult>((resolve) => {
        resolveCreate = resolve;
      });
    });

    renderShareConfigModal(onCreate);
    fireEvent.click(screen.getByRole('button', { name: /create share link/i }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenMetrics: expect.arrayContaining(['management_fees']) })
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /management fees/i }));
    resolveCreate({ shareUrl: '/shared/s1', shareId: 'share-1' });

    await waitFor(() => {
      expect(screen.getByText('Share Link Created Successfully')).toBeInTheDocument();
    });
    expect(screen.getByText('Management Fees')).toBeInTheDocument();
  });
});
