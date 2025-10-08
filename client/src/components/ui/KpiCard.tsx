import * as React from "react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  intent?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(
  ({ label, value, delta, intent = 'neutral', className }, ref) => {
    // Intent-based styling for delta
    const getDeltaStyles = () => {
      switch (intent) {
        case 'positive':
          return 'text-success';
        case 'negative':
          return 'text-error';
        case 'neutral':
        default:
          return 'text-charcoal/60';
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg bg-white border border-lightGray shadow-card font-poppins p-6",
          "transition-all duration-200 hover:shadow-elevated",
          className
        )}
      >
        <div className="flex flex-col space-y-2">
          {/* Label */}
          <p className="text-sm font-medium text-charcoal/70">
            {label}
          </p>

          {/* Value */}
          <p className="text-2xl font-bold text-charcoal tabular-nums">
            {value}
          </p>

          {/* Delta (optional) */}
          {delta && (
            <div className="flex items-center">
              <span className={cn(
                "text-sm font-medium tabular-nums",
                getDeltaStyles()
              )}>
                {delta}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

KpiCard.displayName = "KpiCard";
