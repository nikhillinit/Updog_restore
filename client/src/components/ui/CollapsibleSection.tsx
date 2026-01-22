/**
 * CollapsibleSection - Progressive disclosure primitive
 *
 * Wraps content in a collapsible section with telemetry tracking.
 * Default collapsed state hides complexity until users need it.
 *
 * @module client/components/ui/CollapsibleSection
 */

import { useState, useCallback } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { track } from '@/lib/telemetry';
import { cn } from '@/lib/utils';

type CollapsibleSectionProps = {
  /** Section identifier for telemetry */
  section: string;
  /** Section title displayed in header */
  title: string;
  /** Optional description shown below title */
  description?: string;
  /** Content to show when expanded */
  children: React.ReactNode;
  /** Whether section starts expanded (default: false for progressive disclosure) */
  defaultOpen?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Icon component to show in header */
  icon?: React.ReactNode;
  /** Variant: 'card' wraps in Card, 'inline' renders without card wrapper */
  variant?: 'card' | 'inline';
};

export function CollapsibleSection({
  section,
  title,
  description,
  children,
  defaultOpen = false,
  className,
  icon,
  variant = 'card',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);

      // Track section toggle for analytics
      track('advanced_section_toggled', {
        section,
        state: open ? 'open' : 'close',
      });
    },
    [section]
  );

  const triggerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        {icon && <div className="text-presson-accent">{icon}</div>}
        <div className="text-left">
          <div className="font-semibold text-presson-text">{title}</div>
          {description && (
            <div className="text-sm text-presson-textMuted">{description}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-presson-textMuted">
          {isOpen ? 'Hide' : 'Show'}
        </span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-presson-textMuted transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-presson-textMuted transition-transform" />
        )}
      </div>
    </div>
  );

  if (variant === 'inline') {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={className}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-4 h-auto hover:bg-presson-surfaceSubtle"
            data-testid={`collapsible-trigger-${section}`}
          >
            {triggerContent}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent
          className="px-4 pb-4"
          data-testid={`collapsible-content-${section}`}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Card
      className={cn('border-presson-borderSubtle bg-presson-surface', className)}
    >
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CardHeader className="pb-0">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
              data-testid={`collapsible-trigger-${section}`}
            >
              {triggerContent}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent data-testid={`collapsible-content-${section}`}>
          <CardContent className="pt-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Convenience component for advanced settings sections
 */
export function AdvancedSettingsSection({
  children,
  className,
  defaultOpen = false,
}: {
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsibleSection
      section="advanced_settings"
      title="Advanced Settings"
      description="Additional configuration options for power users"
      defaultOpen={defaultOpen}
      {...(className ? { className } : {})}
    >
      {children}
    </CollapsibleSection>
  );
}
