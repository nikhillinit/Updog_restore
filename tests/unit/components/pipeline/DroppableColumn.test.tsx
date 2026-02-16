/**
 * Unit tests for DroppableColumn component.
 *
 * Validates column header rendering, drop-target highlighting,
 * child slot, and empty-state placeholder behavior.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DroppableColumn } from '@/components/pipeline/DroppableColumn';

// ---- mocks ----

const mockUseDroppable = vi.fn().mockReturnValue({
  setNodeRef: vi.fn(),
  isOver: false,
});

vi.mock('@dnd-kit/core', () => ({
  useDroppable: (...args: unknown[]) => mockUseDroppable(...args),
}));

// ---- tests ----

describe('DroppableColumn', () => {
  it('renders label and count badge', () => {
    render(
      <DroppableColumn id="lead" label="Leads" color="bg-blue-500" dealCount={5}>
        <div>child</div>
      </DroppableColumn>
    );

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <DroppableColumn id="lead" label="Leads" color="bg-blue-500" dealCount={2}>
        <div data-testid="child-element">Deal content</div>
      </DroppableColumn>
    );

    expect(screen.getByTestId('child-element')).toBeInTheDocument();
    expect(screen.getByText('Deal content')).toBeInTheDocument();
  });

  it('has correct data-testid', () => {
    render(
      <DroppableColumn id="qualified" label="Qualified" color="bg-green-500" dealCount={3}>
        <div>child</div>
      </DroppableColumn>
    );

    expect(screen.getByTestId('droppable-column-qualified')).toBeInTheDocument();
  });

  it('applies highlight when isOver from hook', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
    });

    const { container } = render(
      <DroppableColumn id="dd" label="Due Diligence" color="bg-amber-500" dealCount={1}>
        <div>child</div>
      </DroppableColumn>
    );

    // The droppable area (second child div) gets ring-2 when highlighted
    const droppableArea = container.querySelector('.ring-2');
    expect(droppableArea).not.toBeNull();
    expect(droppableArea?.className).toContain('ring-blue-200');
  });

  it('shows empty state when dealCount is 0', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
    });

    render(
      <DroppableColumn id="lead" label="Leads" color="bg-blue-500" dealCount={0}>
        {/* no children */}
      </DroppableColumn>
    );

    expect(screen.getByText('No deals')).toBeInTheDocument();
  });

  it('does not show empty state when dealCount > 0', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
    });

    render(
      <DroppableColumn id="lead" label="Leads" color="bg-blue-500" dealCount={3}>
        <div>Some deal</div>
      </DroppableColumn>
    );

    expect(screen.queryByText('No deals')).not.toBeInTheDocument();
  });
});
