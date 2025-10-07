/**
 * CollapsibleCard - Expandable/collapsible card component for wizard steps
 *
 * Features:
 * - Smooth expand/collapse animation
 * - Summary line when collapsed
 * - Chevron icon indicator
 * - Keyboard accessible
 * - Builds on shadcn/ui Card component
 */

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleCardProps {
  /** Card title */
  title: string;

  /** Optional description (shown in header when expanded) */
  description?: string;

  /** Summary line (shown when collapsed instead of description) */
  summary?: React.ReactNode;

  /** Default expansion state */
  defaultExpanded?: boolean;

  /** Content to show/hide */
  children: React.ReactNode;

  /** Additional class names */
  className?: string;
}

export function CollapsibleCard({
  title,
  description,
  summary,
  defaultExpanded = false,
  children,
  className,
}: CollapsibleCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setIsExpanded((prev) => !prev);

  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpanded();
          }
        }}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{title}</CardTitle>
            {isExpanded && description && <CardDescription className="mt-1.5">{description}</CardDescription>}
            {!isExpanded && summary && (
              <div className="mt-1.5 text-sm text-muted-foreground">{summary}</div>
            )}
          </div>

          {/* Chevron Icon */}
          <ChevronRight
            className={cn(
              'h-5 w-5 text-gray-500 transition-transform duration-200 flex-shrink-0',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </CardHeader>

      {/* Collapsible Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        )}
        aria-hidden={!isExpanded}
      >
        <CardContent className={cn('pt-0', isExpanded && 'pb-6')}>
          {children}
        </CardContent>
      </div>
    </Card>
  );
}

export default CollapsibleCard;
