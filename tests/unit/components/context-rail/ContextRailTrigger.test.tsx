import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextRailTrigger } from '@/components/context-rail/ContextRailTrigger';
import type { ContextRailSection } from '@/components/context-rail/context-rail-types';

const sections: ContextRailSection[] = [
  { id: 'freshness', title: 'Freshness', items: [], emptyText: 'No freshness signal yet.' },
];

describe('ContextRailTrigger', () => {
  it('renders a visible trigger and opens the rail in a Sheet', async () => {
    const user = userEvent.setup();
    render(<ContextRailTrigger sections={sections} />);

    const trigger = screen.getByRole('button', { name: /context/i });
    expect(trigger).toBeInTheDocument();
    // Closed: rail content not mounted yet (Radix Dialog mounts on open).
    expect(screen.queryByRole('complementary', { name: 'Context rail' })).not.toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByRole('complementary', { name: 'Context rail' })).toBeInTheDocument();
    expect(screen.getByText('Freshness')).toBeInTheDocument();
  });
});
