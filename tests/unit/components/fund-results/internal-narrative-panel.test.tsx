import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  INTERNAL_NARRATIVE_NOTICE,
  type InternalNarrativeDraftV1,
  renderNarrativeBasisLine,
  renderNarrativeCopyBlock,
} from '../../../../shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import { InternalNarrativePanel } from '../../../../client/src/components/fund-results/InternalNarrativePanel';

const { NARRATIVE, generateSpy, appendNoteSpy } = vi.hoisted(() => {
  const narrative = {
    contractVersion: 'internal-narrative-draft-v1',
    narrativeDraftId: 5,
    fundId: 1,
    anchor: { kind: 'analysis_reference', id: 88 },
    revision: 2,
    supersedesDraftId: 4,
    basis: {
      financialFactsSnapshotId: 41,
      knowledgeCutoff: '2026-07-02T00:00:00.000Z',
      forecastFundSnapshotId: 902,
    },
    claims: [
      {
        ordinal: 0,
        marker: 'S1',
        body: 'Financial facts are pinned to snapshot #41.',
        authorship: 'generated',
        source: { kind: 'facts_snapshot', id: 41 },
      },
      {
        ordinal: 1,
        marker: 'C1',
        body: 'Pacing is ahead of plan.',
        authorship: 'user_authored_commentary',
        source: null,
      },
    ],
    createdBy: 9,
    createdAt: '2026-07-02T12:00:00.000Z',
  };
  return { NARRATIVE: narrative, generateSpy: vi.fn(), appendNoteSpy: vi.fn() };
});

vi.mock('@/hooks/useInternalNarratives', () => ({
  useInternalNarratives: () => ({
    narrative: NARRATIVE,
    notes: [
      {
        noteId: 1,
        fundId: 1,
        anchor: NARRATIVE.anchor,
        body: 'A note.',
        supersedesNoteId: null,
        createdBy: null,
        createdAt: '2026-07-02T12:00:00.000Z',
      },
    ],
    isLoading: false,
    error: null,
    generate: generateSpy,
    isGenerating: false,
    revise: vi.fn(),
    isRevising: false,
    appendNote: appendNoteSpy,
    isAppendingNote: false,
    mutationError: null,
  }),
}));

const ANCHOR = { kind: 'analysis_reference', id: 88 } as const;
const EXPECTED_BLOCK = renderNarrativeCopyBlock(NARRATIVE as InternalNarrativeDraftV1);

let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  generateSpy.mockClear();
  appendNoteSpy.mockClear();
});

describe('InternalNarrativePanel', () => {
  it('renders notice, basis line, and inline [S1] markers inside ONE copyable block', () => {
    render(<InternalNarrativePanel fundId={1} anchor={ANCHOR} />);
    const block = screen.getByTestId('internal-narrative-copy-block');

    // The whole provenance block is exactly the pure renderer's output.
    expect(block.textContent).toBe(EXPECTED_BLOCK);
    // ...which contains the notice, the basis line, and the inline marker together.
    expect(block.textContent).toContain(INTERNAL_NARRATIVE_NOTICE);
    expect(block.textContent).toContain(renderNarrativeBasisLine(NARRATIVE.basis));
    expect(block.textContent).toContain('Financial facts are pinned to snapshot #41. [S1]');
    expect(block.textContent).toContain('[S1] financial facts snapshot #41');
    // User commentary is labelled, not given a fake source marker.
    expect(block.textContent).toContain('Pacing is ahead of plan. (user commentary)');
  });

  it('copies exactly the rendered block, so the copy cannot drift from what is shown', () => {
    render(<InternalNarrativePanel fundId={1} anchor={ANCHOR} />);
    const copyButton = screen.getByRole('button', {
      name: /copy the full source-linked narrative/i,
    });

    fireEvent.click(copyButton);

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(clipboardWrite).toHaveBeenCalledWith(EXPECTED_BLOCK);
    expect(clipboardWrite.mock.calls[0]?.[0]).toBe(
      screen.getByTestId('internal-narrative-copy-block').textContent
    );
  });

  it('renders the append-only notes and offers a regenerate control', () => {
    render(<InternalNarrativePanel fundId={1} anchor={ANCHOR} />);

    expect(screen.getByTestId('internal-analysis-note-1').textContent).toContain('A note.');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it('hides the narrative body until an anchor is resolved', () => {
    render(<InternalNarrativePanel fundId={1} anchor={null} />);

    expect(screen.queryByTestId('internal-narrative-copy-block')).toBeNull();
    expect(screen.getByText(/attach a source-linked narrative/i)).toBeTruthy();
  });
});
