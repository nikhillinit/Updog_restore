/**
 * Contextual Tooltip & Intelligent Skeleton Tests
 *
 * Tests for the contextual-tooltip and intelligent-skeleton UI components.
 * (Tests for AIInsightCard / ProgressiveDisclosureContainer were removed when the
 * orphaned Executive Dashboard cluster they belonged to was deleted.)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock dependencies before importing components
vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Import the components
import ContextualTooltip, { PowerLawTooltip, IRRTooltip } from '@/components/ui/contextual-tooltip';
import IntelligentSkeleton from '@/components/ui/intelligent-skeleton';

describe('ContextualTooltip', () => {
  it('renders basic tooltip content', () => {
    render(<ContextualTooltip concept="power-law">Power Law</ContextualTooltip>);

    expect(screen.getByText('Power Law')).toBeInTheDocument();
  });

  it('renders inline variant correctly', () => {
    render(
      <ContextualTooltip concept="irr" variant="inline">
        IRR
      </ContextualTooltip>
    );

    const element = screen.getByText('IRR');
    expect(element).toHaveClass(/underline/);
  });

  it('renders convenience components', () => {
    render(
      <div>
        <PowerLawTooltip>Power Law Test</PowerLawTooltip>
        <IRRTooltip>IRR Test</IRRTooltip>
      </div>
    );

    expect(screen.getByText('Power Law Test')).toBeInTheDocument();
    expect(screen.getByText('IRR Test')).toBeInTheDocument();
  });

  it('handles unknown concepts gracefully', () => {
    render(<ContextualTooltip concept="unknown-concept">Unknown</ContextualTooltip>);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('IntelligentSkeleton', () => {
  it('renders dashboard skeleton', () => {
    render(
      <IntelligentSkeleton
        variant={{ type: 'dashboard' }}
        preview={{
          title: 'Loading Dashboard',
          dataType: 'Portfolio Data',
        }}
      />
    );

    expect(screen.getByText(/Loading.*Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Portfolio Data/)).toBeInTheDocument();
  });

  it('renders chart skeleton with correct type', () => {
    render(
      <IntelligentSkeleton
        variant={{ type: 'chart' }}
        preview={{
          title: 'Loading Chart',
          dataType: 'Time Series',
        }}
      />
    );

    expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
  });

  it('renders table skeleton with custom dimensions', () => {
    render(
      <IntelligentSkeleton
        variant={{
          type: 'table',
          rows: 3,
          columns: 4,
          showHeaders: true,
        }}
      />
    );

    const pulsingElements = document.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });

  it('can disable animations', () => {
    render(<IntelligentSkeleton variant={{ type: 'dashboard' }} animated={false} />);

    const shimmerOverlays = document.querySelectorAll("[class*='animate-[shimmer_']");
    expect(shimmerOverlays.length).toBe(0);
  });
});
