/**
 * SplitPane - Responsive split-screen layout primitive
 *
 * Desktop: side-by-side with left content and sticky right panel
 * Mobile: stacked layout (right panel hidden by default)
 *
 * @module client/components/ui/SplitPane
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

type SplitPaneProps = {
  /** Left panel content (typically form/editor) */
  left: React.ReactNode;
  /** Right panel content (typically context/preview) */
  right: React.ReactNode;
  /** Width of right panel (default: 360px) */
  rightWidth?: string;
  /** Breakpoint at which to stack (default: md) */
  stackAt?: 'md' | 'lg';
  /** Additional classes for root container */
  className?: string;
  /** Additional classes for left panel */
  leftClassName?: string;
  /** Additional classes for right panel */
  rightClassName?: string;
};

export function SplitPane({
  left,
  right,
  rightWidth = '360px',
  stackAt = 'md',
  className,
  leftClassName,
  rightClassName,
}: SplitPaneProps) {
  const breakpoint = stackAt === 'lg' ? 'lg' : 'md';
  const isDefaultWidth = rightWidth === '360px';

  // Use standard class for default width, CSS variable for custom
  const gridColsClass = isDefaultWidth
    ? `${breakpoint}:grid-cols-[1fr_360px]`
    : `${breakpoint}:grid-cols-[1fr_var(--splitpane-right)]`;

  return (
    <div
      data-testid="split-pane"
      className={cn('grid grid-cols-1 gap-6', gridColsClass, className)}
      style={
        isDefaultWidth
          ? undefined
          : ({ '--splitpane-right': rightWidth } as React.CSSProperties)
      }
    >
      <div className={cn('min-w-0', leftClassName)}>{left}</div>
      <div
        className={cn(
          'hidden sticky top-0',
          `${breakpoint}:block`,
          `${breakpoint}:self-start`,
          rightClassName
        )}
      >
        {right}
      </div>
    </div>
  );
}
