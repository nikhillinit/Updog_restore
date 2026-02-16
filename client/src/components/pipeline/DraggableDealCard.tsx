/**
 * DraggableDealCard - Makes a DealCard draggable via @dnd-kit/core.
 *
 * Wraps the existing DealCard in a draggable container with transform
 * styles, reduced opacity during drag, and accessibility attributes.
 */

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { DealOpportunity } from '@shared/schema';
import { DealCard } from '@/components/pipeline/DealCard';

interface DraggableDealCardProps {
  deal: DealOpportunity;
  onClick?: () => void;
}

export function DraggableDealCard({ deal, ...rest }: DraggableDealCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(deal.id),
    data: { deal },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-50' : undefined}
      data-testid={`draggable-deal-${deal.id}`}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable deal card"
    >
      <DealCard deal={deal} {...(rest.onClick != null && { onClick: rest.onClick })} />
    </div>
  );
}
