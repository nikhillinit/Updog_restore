 
 
 
 
 
import React from 'react';
import { format } from 'date-fns/format';
import { cn } from '@/lib/utils';

// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title }: { title: string }) => (
  <div className="h-40 bg-gray-50 rounded-lg flex flex-col items-center justify-center">
    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
      <div className="h-6 w-6 text-gray-400">📊</div>
    </div>
    <p className="text-gray-500 font-medium text-sm">{title}</p>
    <p className="text-gray-400 text-xs mt-1">Interactive timeline - data available via API</p>
  </div>
);

interface TimelineEvent {
  id: string;
  time: Date;
  type: string;
  label?: string;
}

interface TimelineSliderProps {
  events: TimelineEvent[];
  currentTime: Date;
  onTimeChange: (_time: Date) => void;
  width?: number;
  height?: number;
  className?: string;
}


export function TimelineSlider({
  events,
  currentTime,
  onTimeChange,
  width = 800,
  height = 120,
  className,
}: TimelineSliderProps) {
  return (
    <div className={cn('relative select-none', className)} style={{ width, height }}>
      <ChartPlaceholder title="Interactive Timeline" />
      
      {/* Current time display */}
      <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow-sm text-sm font-mono">
        {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}
      </div>
      
      {/* Event count display */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500">
        {events.length} events
      </div>
    </div>
  );
}

