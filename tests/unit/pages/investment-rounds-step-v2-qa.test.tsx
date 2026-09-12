import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=2', vi.fn()],
}));

vi.mock('@/stores/useFundSelector', () => ({
  useFundAction: (selector: (actions: { fromInvestmentStrategy: () => void }) => unknown) =>
    selector({ fromInvestmentStrategy: vi.fn() }),
}));

vi.mock('@/components/wizard/ModernStepContainer', () => ({
  ModernStepContainer: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@/components/wizard/SectorProfileSwitcher', () => ({
  SectorProfileSwitcher: () => <aside>Profiles</aside>,
}));

vi.mock('@/components/wizard/StageAccordionRow', () => ({
  StageAccordionRow: () => <div>Stage</div>,
}));

vi.mock('@/components/wizard/InvestmentValidationCallout', () => ({
  InvestmentValidationCallout: () => <div>Validation</div>,
}));

vi.mock('@/components/wizard/InfoBanner', () => ({
  InfoBanner: () => <div>Info</div>,
}));

import InvestmentRoundsStepV2 from '@/pages/InvestmentRoundsStepV2';

describe('InvestmentRoundsStepV2 QA regressions', () => {
  it('does not add a second main landmark or invent an edit timestamp', () => {
    const { container } = render(
      <main>
        <InvestmentRoundsStepV2 />
      </main>
    );

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByText('5 investment stages defined')).toBeInTheDocument();
    expect(screen.queryByText(/Last edited/i)).not.toBeInTheDocument();
  });
});
