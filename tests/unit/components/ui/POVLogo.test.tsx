import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { POVBrandHeader, POVIcon, POVLogo } from '@/components/ui/POVLogo';

function decodeInlineSvg(image: HTMLElement) {
  const src = image.getAttribute('src') ?? '';
  expect(src).toMatch(/^data:image\/svg\+xml;utf8,/);
  return decodeURIComponent(src.replace(/^data:image\/svg\+xml;utf8,/, ''));
}

function expectInlineBrandImage(image: HTMLElement) {
  expect(image).toHaveAttribute('alt', 'Press On Ventures');
  const svg = decodeInlineSvg(image);
  expect(svg).not.toContain('cdn.builder.io');
  expect(svg).not.toContain('<text');
  return svg;
}

describe('POVLogo', () => {
  it('renders the guideline vector logo from an inline SVG asset instead of the Builder CDN', () => {
    render(<POVLogo variant="dark" size="lg" />);

    const image = screen.getByRole('img', { name: /press on ventures/i });
    const svg = expectInlineBrandImage(image);
    expect(svg).toContain('viewBox="0 0 845 185"');
    expect(svg).toContain('#292929');
    expect(image).toHaveClass('h-16');
  });

  it('preserves icon sizing and accessible brand text offline', () => {
    render(<POVIcon variant="white" size="sm" className="custom-icon" />);

    const image = screen.getByRole('img', { name: /press on ventures/i });
    const svg = expectInlineBrandImage(image);
    expect(svg).toContain('viewBox="0 0 175 185"');
    expect(svg).toContain('#FFFFFF');
    expect(svg).not.toContain('#292929');
    expect(image.parentElement).toHaveClass('w-6', 'h-6', 'custom-icon');
  });

  it('uses the guideline beige mark for the light variant', () => {
    render(<POVLogo variant="light" />);

    const svg = decodeInlineSvg(screen.getByRole('img', { name: /press on ventures/i }));
    expect(svg).toContain('#E0D8D1');
    expect(svg).not.toContain('#F4EFEA');
  });

  it('keeps brand header compatibility when the logo is shown', () => {
    render(<POVBrandHeader title="Reports" subtitle="Quarterly package" variant="dark" />);

    expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
    expectInlineBrandImage(screen.getByRole('img', { name: /press on ventures/i }));
  });
});
