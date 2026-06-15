import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareConfigModal from '@/components/sharing/ShareConfigModal';

vi.mock('@/shared/useFlags', () => ({ useFlag: vi.fn() }));
import { useFlag } from '@/shared/useFlags';

const mockUseFlag = vi.mocked(useFlag);

function renderShareConfigModal() {
  const onCreate = vi.fn().mockResolvedValue({ shareUrl: '/shared/s1', shareId: 'share-1' });

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
});
