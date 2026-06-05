import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;
type CalendarChevronProps = {
  className?: string;
  size?: number;
  disabled?: boolean;
  orientation?: 'left' | 'right' | 'up' | 'down';
};

function CalendarChevron({ className, size = 16, orientation = 'left' }: CalendarChevronProps) {
  const iconProps = { className: cn('h-4 w-4', className), size };

  if (orientation === 'down') {
    return <ChevronDown {...iconProps} />;
  }

  if (orientation === 'up') {
    return <ChevronUp {...iconProps} />;
  }

  if (orientation === 'right') {
    return <ChevronRight {...iconProps} />;
  }

  return <ChevronLeft {...iconProps} />;
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const mergedClassNames = {
    months: 'relative flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
    month: 'space-y-4',
    month_caption: 'flex justify-center pt-1 relative items-center',
    caption_label: 'text-sm font-medium',
    nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
    button_previous: cn(
      buttonVariants({ variant: 'outline' }),
      'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
    ),
    button_next: cn(
      buttonVariants({ variant: 'outline' }),
      'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
    ),
    month_grid: 'w-full border-collapse space-y-1',
    weekdays: 'flex',
    weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
    week: 'flex w-full mt-2',
    day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range_end)]:rounded-r-md [&:has([aria-selected].outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
    day_button: cn(
      buttonVariants({ variant: 'ghost' }),
      'h-9 w-9 p-0 font-normal aria-selected:opacity-100'
    ),
    range_end: 'range_end',
    selected:
      'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
    today: 'bg-accent text-accent-foreground',
    outside:
      'outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
    disabled: 'text-muted-foreground opacity-50',
    range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
    hidden: 'invisible',
    ...classNames,
  };

  const calendarComponents = {
    Chevron: CalendarChevron,
  } as CalendarProps['components'];

  const dayPickerProps = {
    ...props,
    showOutsideDays,
    className: cn('p-3', className),
    classNames: mergedClassNames,
    components: calendarComponents,
  } as CalendarProps;

  return <DayPicker {...dayPickerProps} />;
}
Calendar.displayName = 'Calendar';

export { Calendar };
