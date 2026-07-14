import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

describe('Sheet reduced-motion gating (DESIGN.md mandatory rule)', () => {
  it('gates content, overlay, and close-control animations behind motion-reduce', () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent side="right">
          <SheetTitle>Panel</SheetTitle>
          <SheetDescription>Details</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    const content = screen.getByRole('dialog');
    expect(content.className).toContain('motion-reduce:transition-none');
    expect(content.className).toContain('motion-reduce:animate-none');

    const overlay = document.querySelector('div[class*="bg-black/80"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('motion-reduce:animate-none');

    const close = screen.getByRole('button', { name: /close/i });
    expect(close.className).toContain('motion-reduce:transition-none');
  });
});
