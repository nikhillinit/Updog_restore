import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function WorkPanel({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className={cn('w-full overflow-y-auto p-0 sm:max-w-xl md:max-w-2xl', className)}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader className="border-b border-beige-200 px-6 py-4 text-left">
          <SheetTitle className="text-charcoal-900">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-charcoal-600">{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="px-6 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
