/**
 * SwipeableMetricCards Component
 *
 * Touch-optimized horizontal swipe navigation for executive metrics.
 * Features:
 * - Snap-to-grid behavior with momentum scrolling
 * - Haptic feedback on supported devices
 * - Accessibility-compliant navigation
 * - Visual indicators for current position
 * - Progressive enhancement for desktop
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import {
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface MetricCardData {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  severity: 'success' | 'warning' | 'critical' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  metadata?: Record<string, any>;
}

interface SwipeableMetricCardsProps {
  metrics: MetricCardData[];
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  onCardSelect?: (metric: MetricCardData, index: number) => void;
  className?: string;
  cardClassName?: string;
  showNavigation?: boolean;
  showIndicators?: boolean;
  autoScroll?: boolean;
  autoScrollInterval?: number;
  compactMode?: boolean;
  cardsPerView?: number; // Mobile: 1, Tablet: 2, Desktop: 4
  enableSwipeNavigation?: boolean;
}

// Individual metric card component
function MetricCard({
  metric,
  isActive = false,
  onClick,
  compactMode = false,
  className
}: {
  metric: MetricCardData;
  isActive?: boolean;
  onClick?: () => void;
  compactMode?: boolean;
  className?: string;
}) {
  const IconComponent = metric.icon;

  const severityConfig = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      iconBg: 'bg-green-100'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      iconBg: 'bg-yellow-100'
    },
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      iconBg: 'bg-red-100'
    },
    neutral: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-800',
      iconBg: 'bg-slate-100'
    }
  };

  const trendConfig = {
    up: { symbol: '↗', color: 'text-green-600' },
    down: { symbol: '↘', color: 'text-red-600' },
    stable: { symbol: '→', color: 'text-slate-500' }
  };

  const config = severityConfig[metric.severity];
  const trendInfo = trendConfig[metric.trend];

  return (
    <Card
      className={cn(
        "transition-all duration-300 cursor-pointer touch-manipulation",
        "hover:shadow-lg active:scale-95 select-none",
        "min-h-[120px]", // Ensure proper touch target
        config.bg,
        config.border,
        isActive && "ring-2 ring-blue-500 ring-offset-2 shadow-lg",
        compactMode && "min-h-[100px]",
        className
      )}
      onClick={() => {
        // Haptic feedback for supported devices
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        onClick?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`${metric.title}: ${metric.value}, ${metric.change} change`}
    >
      <CardContent className={cn(
        "p-4 h-full flex flex-col justify-between",
        compactMode && "p-3"
      )}>
        {/* Header with icon and trend */}
        <div className="flex items-start justify-between mb-3">
          <div className={cn(
            "p-2 rounded-lg",
            config.iconBg,
            compactMode && "p-1.5"
          )}>
            <IconComponent className={cn(
              "h-5 w-5",
              config.text,
              compactMode && "h-4 w-4"
            )} />
          </div>
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-sm font-mono",
              trendInfo.color
            )}>
              {trendInfo.symbol}
            </span>
            <span className={cn(
              "text-sm font-semibold",
              trendInfo.color
            )}>
              {metric.change}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-1 flex-grow">
          <p className={cn(
            "font-poppins text-xs",
            config.text,
            "opacity-70"
          )}>
            {metric.title}
          </p>
          <p className={cn(
            "font-inter font-bold text-2xl",
            config.text,
            compactMode && "text-xl"
          )}>
            {metric.value}
          </p>
          <p className={cn(
            "font-mono text-xs",
            config.text,
            "opacity-60"
          )}>
            {metric.subtitle}
          </p>
        </div>

        {/* Active indicator */}
        {isActive && (
          <div className="mt-2 flex justify-center">
            <div className="w-8 h-1 bg-blue-500 rounded-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main SwipeableMetricCards component
export function SwipeableMetricCards({
  metrics,
  activeIndex = 0,
  onIndexChange,
  onCardSelect,
  className,
  cardClassName,
  showNavigation = true,
  showIndicators = true,
  autoScroll = false,
  autoScrollInterval = 5000,
  compactMode = false,
  cardsPerView = 1,
  enableSwipeNavigation = true
}: SwipeableMetricCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0, time: 0 });
  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Handle index changes
  const handleIndexChange = useCallback((newIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(metrics.length - 1, newIndex));
    setCurrentIndex(clampedIndex);
    onIndexChange?.(clampedIndex);

    // Scroll to the correct position
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      const cardWidth = scrollContainer.clientWidth / cardsPerView;
      const targetScrollLeft = clampedIndex * cardWidth;

      scrollContainer.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth'
      });
    }
  }, [metrics.length, onIndexChange, cardsPerView]);

  // Auto-scroll functionality
  useEffect(() => {
    if (autoScroll && metrics.length > 1) {
      autoScrollTimeoutRef.current = setTimeout(() => {
        const nextIndex = (currentIndex + 1) % metrics.length;
        handleIndexChange(nextIndex);
      }, autoScrollInterval);

      return () => {
        if (autoScrollTimeoutRef.current) {
          clearTimeout(autoScrollTimeoutRef.current);
        }
      };
    }
  }, [autoScroll, currentIndex, metrics.length, autoScrollInterval, handleIndexChange]);

  // Touch/Mouse event handlers
  const handlePointerDown = (clientX: number) => {
    if (!scrollRef.current) return;

    setIsDragging(true);
    setDragStart({
      x: clientX,
      scrollLeft: scrollRef.current.scrollLeft,
      time: Date.now()
    });

    // Stop auto-scroll when user interacts
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }
  };

  const handlePointerMove = (clientX: number) => {
    if (!isDragging || !scrollRef.current) return;

    const deltaX = clientX - dragStart.x;
    const newScrollLeft = dragStart.scrollLeft - deltaX;
    scrollRef.current.scrollLeft = newScrollLeft;
  };

  const handlePointerUp = (clientX: number) => {
    if (!isDragging || !scrollRef.current) return;

    setIsDragging(false);

    const deltaX = clientX - dragStart.x;
    const deltaTime = Date.now() - dragStart.time;
    const velocity = Math.abs(deltaX) / deltaTime;

    // Determine if it's a swipe or click
    const isSwipe = Math.abs(deltaX) > 50 || velocity > 0.5;

    if (isSwipe) {
      // Swipe navigation
      const direction = deltaX > 0 ? -1 : 1;
      const newIndex = currentIndex + direction;
      handleIndexChange(newIndex);
    } else {
      // Snap to nearest card
      const cardWidth = scrollRef.current.clientWidth / cardsPerView;
      const newIndex = Math.round(scrollRef.current.scrollLeft / cardWidth);
      handleIndexChange(newIndex);
    }
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    handlePointerDown(e.touches[0]!.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handlePointerMove(e.touches[0]!.clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    handlePointerUp(e.changedTouches[0]!.clientX);
  };

  // Mouse events for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handlePointerDown(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handlePointerMove(e.clientX);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    handlePointerUp(e.clientX);
  };

  // Navigation functions
  const goToPrevious = () => {
    handleIndexChange(currentIndex - 1);
  };

  const goToNext = () => {
    handleIndexChange(currentIndex + 1);
  };

  const handleCardClick = (metric: MetricCardData, index: number) => {
    if (Math.abs(Date.now() - dragStart.time) < 200) {
      // Quick tap - treat as selection
      onCardSelect?.(metric, index);
    }
    handleIndexChange(index);
  };

  // Responsive cards per view
  const getCardsPerView = () => {
    if (typeof window === 'undefined') return cardsPerView;

    const width = window.innerWidth;
    if (width >= 1024) return Math.min(4, metrics.length); // Desktop
    if (width >= 640) return Math.min(2, metrics.length);  // Tablet
    return 1; // Mobile
  };

  const responsiveCardsPerView = getCardsPerView();

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with title and navigation */}
      {showNavigation && (
        <div className="flex items-center justify-between">
          <h3 className="font-inter font-semibold text-lg text-slate-900">
            Key Metrics
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="h-8 w-8 p-0"
              aria-label="Previous metric"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {showIndicators && (
              <div className="flex items-center gap-1 px-2">
                {metrics.map((_, index) => (
                  <button
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      index === currentIndex
                        ? "bg-blue-600 w-4"
                        : "bg-slate-300 hover:bg-slate-400"
                    )}
                    onClick={() => handleIndexChange(index)}
                    aria-label={`Go to metric ${index + 1}`}
                  />
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              disabled={currentIndex === metrics.length - 1}
              className="h-8 w-8 p-0"
              aria-label="Next metric"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Swipeable container */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory",
          "touch-pan-x select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={isDragging ? handleMouseUp : undefined}
        onMouseLeave={isDragging ? handleMouseUp : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goToPrevious();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            goToNext();
          }
        }}
        tabIndex={0}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {metrics.map((metric, index) => (
          <div
            key={metric.id}
            className={cn(
              "flex-shrink-0 snap-start",
              responsiveCardsPerView === 1 && "w-full",
              responsiveCardsPerView === 2 && "w-[calc(50%-0.5rem)]",
              responsiveCardsPerView >= 4 && "w-[calc(25%-0.75rem)]"
            )}
          >
            <MetricCard
              metric={metric}
              isActive={index === currentIndex}
              onClick={() => handleCardClick(metric, index)}
              compactMode={compactMode}
              {...spreadIfDefined('className', cardClassName)}
            />
          </div>
        ))}
      </div>

      {/* Accessibility info */}
      <div className="sr-only" aria-live="polite">
        Showing metric {currentIndex + 1} of {metrics.length}: {metrics[currentIndex]?.title}
      </div>
    </div>
  );
}

export default SwipeableMetricCards;