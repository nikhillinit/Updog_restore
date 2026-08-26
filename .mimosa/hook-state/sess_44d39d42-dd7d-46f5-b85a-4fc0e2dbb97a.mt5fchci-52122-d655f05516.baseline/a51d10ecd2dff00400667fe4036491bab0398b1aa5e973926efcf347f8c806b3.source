import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/ui/KpiCard';

describe('KpiCard Component', () => {
  describe('Basic Rendering', () => {
    it('renders with label and value', () => {
      render(<KpiCard label="Net IRR" value="24.5%" />);

      expect(screen.getByText('Net IRR')).toBeInTheDocument();
      expect(screen.getByText('24.5%')).toBeInTheDocument();
    });

    it('renders without delta when not provided', () => {
      const { container } = render(<KpiCard label="Total Fund Size" value="$100M" />);

      expect(screen.getByText('Total Fund Size')).toBeInTheDocument();
      expect(screen.getByText('$100M')).toBeInTheDocument();
      // Delta should not be present
      expect(container.textContent).not.toContain('+');
      expect(container.textContent).not.toContain('-');
    });
  });

  describe('Delta and Intent Styling', () => {
    it('renders positive intent with correct styling', () => {
      render(<KpiCard label="Net IRR" value="24.5%" delta="+2.1%" intent="positive" />);

      const deltaElement = screen.getByText('+2.1%');
      expect(deltaElement).toBeInTheDocument();
      expect(deltaElement).toHaveClass('text-success');
    });

    it('renders negative intent with correct styling', () => {
      render(<KpiCard label="Portfolio Value" value="$85M" delta="-5.2%" intent="negative" />);

      const deltaElement = screen.getByText('-5.2%');
      expect(deltaElement).toBeInTheDocument();
      expect(deltaElement).toHaveClass('text-error');
    });

    it('renders neutral intent with correct styling', () => {
      render(<KpiCard label="Deployed Capital" value="$50M" delta="0%" intent="neutral" />);

      const deltaElement = screen.getByText('0%');
      expect(deltaElement).toBeInTheDocument();
      expect(deltaElement).toHaveClass('text-charcoal/60');
    });

    it('defaults to neutral intent when not specified', () => {
      render(<KpiCard label="Companies" value="30" delta="+3" />);

      const deltaElement = screen.getByText('+3');
      expect(deltaElement).toHaveClass('text-charcoal/60');
    });
  });

  describe('Press On Ventures Brand Styling', () => {
    it('uses correct card styling with brand colors', () => {
      const { container } = render(<KpiCard label="Test Metric" value="100" />);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('border-lightGray');
      expect(card).toHaveClass('shadow-card');
      expect(card).toHaveClass('font-poppins');
    });

    it('applies hover effect styling', () => {
      const { container } = render(<KpiCard label="Test Metric" value="100" />);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('transition-all');
      expect(card).toHaveClass('hover:shadow-elevated');
    });

    it('uses tabular-nums for numeric values', () => {
      render(<KpiCard label="IRR" value="24.5%" delta="+2.1%" />);

      const valueElement = screen.getByText('24.5%');
      const deltaElement = screen.getByText('+2.1%');

      expect(valueElement).toHaveClass('tabular-nums');
      expect(deltaElement).toHaveClass('tabular-nums');
    });

    it('uses charcoal color for text', () => {
      render(<KpiCard label="Test Metric" value="100" />);

      const labelElement = screen.getByText('Test Metric');
      const valueElement = screen.getByText('100');

      expect(labelElement).toHaveClass('text-charcoal/70');
      expect(valueElement).toHaveClass('text-charcoal');
    });
  });

  describe('Custom className', () => {
    it('accepts and applies custom className', () => {
      const { container } = render(<KpiCard label="Test" value="100" className="custom-class" />);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('custom-class');
      // Should still have base classes
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('bg-white');
    });
  });

  describe('Ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<KpiCard ref={ref} label="Test" value="100" />);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Financial Metrics Examples', () => {
    it('displays IRR metric correctly', () => {
      render(<KpiCard label="Net IRR" value="24.5%" delta="+2.1%" intent="positive" />);

      expect(screen.getByText('Net IRR')).toBeInTheDocument();
      expect(screen.getByText('24.5%')).toBeInTheDocument();
      expect(screen.getByText('+2.1%')).toBeInTheDocument();
    });

    it('displays fund size metric correctly', () => {
      render(<KpiCard label="Total Fund Size" value="$100M" />);

      expect(screen.getByText('Total Fund Size')).toBeInTheDocument();
      expect(screen.getByText('$100M')).toBeInTheDocument();
    });

    it('displays portfolio companies metric correctly', () => {
      render(<KpiCard label="Portfolio Companies" value="30" delta="+3" intent="positive" />);

      expect(screen.getByText('Portfolio Companies')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('displays negative performance metric correctly', () => {
      render(<KpiCard label="Portfolio Value" value="$85.2M" delta="-5.2%" intent="negative" />);

      expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
      expect(screen.getByText('$85.2M')).toBeInTheDocument();

      const deltaElement = screen.getByText('-5.2%');
      expect(deltaElement).toHaveClass('text-error');
    });
  });

  describe('Layout and Structure', () => {
    it('renders with correct component structure', () => {
      const { container } = render(<KpiCard label="Test Metric" value="100" delta="+10%" />);

      // Check main container
      const card = container.firstChild as HTMLElement;
      expect(card.tagName).toBe('DIV');

      // Check content structure
      const contentContainer = card.querySelector('.flex.flex-col');
      expect(contentContainer).toBeInTheDocument();
    });

    it('applies correct spacing between elements', () => {
      const { container } = render(<KpiCard label="Test Metric" value="100" delta="+10%" />);

      const contentContainer = container.querySelector('.flex.flex-col');
      expect(contentContainer).toHaveClass('space-y-2');
    });
  });
});
