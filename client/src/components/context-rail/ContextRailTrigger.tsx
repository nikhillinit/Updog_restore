import { useState } from 'react';
import { PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ContextRail } from './ContextRail';
import type { ContextRailSection } from './context-rail-types';

export function ContextRailTrigger({
  sections,
  className,
}: {
  sections: ContextRailSection[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn('text-charcoal-700', className)}>
          <PanelRight className="mr-2 h-4 w-4" />
          Context
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="text-charcoal-900">Context</SheetTitle>
          <SheetDescription className="text-charcoal-600">
            Freshness, attention, and recent activity for this fund.
          </SheetDescription>
        </SheetHeader>
        <ContextRail sections={sections} className="mt-6" />
      </SheetContent>
    </Sheet>
  );
}
