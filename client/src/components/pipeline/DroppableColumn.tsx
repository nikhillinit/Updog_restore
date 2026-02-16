/**
 * DroppableColumn - Kanban column drop target via @dnd-kit/core.
 *
 * Renders a fixed-width column with a header (color dot, label, count badge)
 * and a droppable area that highlights on hover. Shows an empty-state
 * placeholder when no deals are present.
 */

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DroppableColumnProps {
  id: string;
  label: string;
  color: string;
  dealCount: number;
  children: ReactNode;
  isOver?: boolean;
}

export function DroppableColumn({
  id,
  label,
  color,
  dealCount,
  children,
  ...rest
}: DroppableColumnProps) {
  const { setNodeRef, isOver: isOverInternal } = useDroppable({ id });

  const highlighted = rest.isOver ?? isOverInternal;

  return (
    <div className="min-w-[280px] w-[280px] flex-shrink-0" data-testid={`droppable-column-${id}`}>
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', color)} />
          <h3 className="font-inter font-semibold text-sm text-pov-charcoal">{label}</h3>
        </div>
        <Badge variant="outline" className="font-poppins text-xs">
          {dealCount}
        </Badge>
      </div>

      {/* Deals Column - droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'space-y-3 min-h-[100px] rounded-lg transition-colors',
          highlighted && 'ring-2 ring-blue-200 bg-blue-50/20'
        )}
      >
        {children}
        {dealCount === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
            <p className="font-poppins text-xs text-gray-400">No deals</p>
          </div>
        )}
      </div>
    </div>
  );
}
