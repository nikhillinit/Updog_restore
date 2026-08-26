import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextRail } from '@/components/context-rail/ContextRail';
import type { ContextRailSection } from '@/components/context-rail/context-rail-types';

const sections: ContextRailSection[] = [
  {
    id: 'freshness',
    title: 'Freshness',
    items: [{ id: 'f1', kind: 'freshness', label: 'Fund metrics', detail: 'As of Apr 24, 2026' }],
    emptyText: 'No freshness signal yet.',
  },
  {
    id: 'attention',
    title: 'Needs attention',
    items: [],
    emptyText: 'No blockers or due items surfaced yet.',
  },
];

describe('ContextRail', () => {
  it('exposes a named complementary landmark', () => {
    render(<ContextRail sections={sections} />);
    expect(screen.getByRole('complementary', { name: 'Context rail' })).toBeInTheDocument();
  });

  it('renders item label + detail for populated sections', () => {
    render(<ContextRail sections={sections} />);
    expect(screen.getByText('Fund metrics')).toBeInTheDocument();
    expect(screen.getByText('As of Apr 24, 2026')).toBeInTheDocument();
  });

  it('renders empty text for empty sections', () => {
    render(<ContextRail sections={sections} />);
    expect(screen.getByText('No blockers or due items surfaced yet.')).toBeInTheDocument();
  });
});
