import React, { useMemo, useRef, useState, useCallback } from 'react';
import { scaleTime, scaleLinear } from '@visx/scale';
import { Axis } from '@visx/axis';
import { Group } from '@visx/group';
import { Line } from '@visx/shape';
import { useGesture } from '@use-gesture/react';
import { animated, useSpring } from '@react-spring/web';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  time: Date;
  type: string;
  label?: string;
}

interface TimelineSliderProps {
  events: TimelineEvent[];
  currentTime: Date;
  onTimeChange: (time: Date) => void;
  width?: number;
  height?: number;
  className?: string;
}

// Skeleton loader for first paint
const TimelineSkeleton = ({ width, height }: { width: number; height: number }) => (
  <div className="animate-pulse">
    <div className="bg-gray-200 rounded" style={{ width, height }} />
  </div>
);

export function TimelineSlider({
  events,
  currentTime,
  onTimeChange,
  width = 800,
  height = 120,
  className,
}: TimelineSliderProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [visibleEvents, setVisibleEvents] = useState<TimelineEvent[]>([]);
  
  // Margins for axis
  const margin = { top: 20, right: 30, bottom: 40, left: 30 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Time scale
  const timeScale = useMemo(() => {
    if (events.length === 0) return null;
    const times = events.map(e => e.time);
    return scaleTime({
      domain: [Math.min(...times), Math.max(...times)],
      range: [0, innerWidth],
    });
  }, [events, innerWidth]);

  // Animated cursor position
  const [{ x }, api] = useSpring(() => ({
    x: timeScale ? timeScale(currentTime) : 0,
    config: { tension: 200, friction: 20 },
  }));

  // Gesture handling with react-use-gesture
  const bind = useGesture({
    onDrag: ({ xy: [pageX], first, last }) => {
      if (!svgRef.current || !timeScale) return;
      
      if (first) setIsDragging(true);
      if (last) setIsDragging(false);

      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(innerWidth, pageX - rect.left - margin.left));
      const time = timeScale.invert(x);
      
      api.start({ x, immediate: true });
      onTimeChange(time);
    },
    onWheel: ({ delta: [, dy], event }) => {
      if (!timeScale) return;
      event.preventDefault();
      
      const currentX = timeScale(currentTime);
      const newX = Math.max(0, Math.min(innerWidth, currentX - dy * 0.5));
      const newTime = timeScale.invert(newX);
      
      api.start({ x: newX });
      onTimeChange(newTime);
    },
  });

  // Load events progressively
  React.useEffect(() => {
    // Load first 30 immediately
    setVisibleEvents(events.slice(0, 30));
    
    // Load rest in idle time
    if (events.length > 30) {
      const loadRest = () => {
        requestIdleCallback(() => {
          setVisibleEvents(events);
        }, { timeout: 1000 });
      };
      loadRest();
    }
  }, [events]);

  // Show skeleton while loading
  if (!timeScale || visibleEvents.length === 0) {
    return <TimelineSkeleton width={width} height={height} />;
  }

  return (
    <div className={cn('relative select-none', className)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        {...bind()}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <Group left={margin.left} top={margin.top}>
          {/* Background */}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            className="hover:fill-gray-50 transition-colors"
          />

          {/* Event markers */}
          {visibleEvents.map((event) => {
            const x = timeScale(event.time);
            return (
              <Group key={event.id} left={x} top={0}>
                <Line
                  from={{ x: 0, y: 0 }}
                  to={{ x: 0, y: innerHeight }}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                />
                <circle
                  cy={innerHeight / 2}
                  r={3}
                  fill={event.type === 'snapshot' ? '#3b82f6' : '#9ca3af'}
                  className="transition-all hover:r-5"
                />
              </Group>
            );
          })}

          {/* Current time cursor */}
          <animated.g transform={x.to(x => `translate(${x}, 0)`)}>
            <Line
              from={{ x: 0, y: -5 }}
              to={{ x: 0, y: innerHeight + 5 }}
              stroke="#ef4444"
              strokeWidth={2}
            />
            <circle
              cy={innerHeight / 2}
              r={6}
              fill="#ef4444"
              className="drop-shadow-lg"
            />
          </animated.g>

          {/* Time axis */}
          <Axis
            top={innerHeight}
            scale={timeScale}
            numTicks={width > 600 ? 10 : 5}
            tickFormat={(d) => format(d as Date, 'MMM d')}
            tickLabelProps={() => ({
              fill: '#6b7280',
              fontSize: 11,
              textAnchor: 'middle',
            })}
          />
        </Group>
      </svg>

      {/* Current time display */}
      <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow-sm text-sm font-mono">
        {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}
      </div>

      {/* Keyboard hints */}
      {isDragging && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-500">
          Drag to navigate • Scroll to zoom
        </div>
      )}
    </div>
  );
}