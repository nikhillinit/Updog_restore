/**
 * Unit tests for DraggableDealCard component.
 *
 * Validates draggable wrapper rendering, accessibility attributes,
 * and visual feedback during drag operations.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealOpportunity } from '@shared/schema';
import { DraggableDealCard } from '@/components/pipeline/DraggableDealCard';

// ---- mocks ----

const mockUseDraggable = vi.fn().mockReturnValue({
  attributes: { role: 'button' },
  listeners: {},
  setNodeRef: vi.fn(),
  transform: null,
  isDragging: false,
});

vi.mock('@dnd-kit/core', () => ({
  useDraggable: (...args: unknown[]) => mockUseDraggable(...args),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Translate: {
      toString: vi.fn().mockReturnValue(null),
    },
  },
}));

// ---- test data ----

const mockDeal = {
  id: 1,
  companyName: 'Acme Corp',
  sector: 'SaaS',
  stage: 'Seed',
  sourceType: 'Referral',
  status: 'lead',
  priority: 'high',
  dealSize: '1000000',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as DealOpportunity;

// ---- tests ----

describe('DraggableDealCard', () => {
  it('renders deal card content', () => {
    render(<DraggableDealCard deal={mockDeal} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('has correct data-testid', () => {
    render(<DraggableDealCard deal={mockDeal} />);

    expect(screen.getByTestId('draggable-deal-1')).toBeInTheDocument();
  });

  it('applies opacity-50 when dragging', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button' },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      isDragging: true,
    });

    render(<DraggableDealCard deal={mockDeal} />);

    const wrapper = screen.getByTestId('draggable-deal-1');
    expect(wrapper.className).toContain('opacity-50');
  });

  it('has draggable aria attribute', () => {
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button' },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      isDragging: false,
    });

    render(<DraggableDealCard deal={mockDeal} />);

    const wrapper = screen.getByTestId('draggable-deal-1');
    expect(wrapper.getAttribute('aria-roledescription')).toBe('draggable deal card');
  });
});
