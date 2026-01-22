/**
 * InvestmentTimeline - Recent fund activity timeline
 *
 * Uses useTimelineData hook internally to fetch and display
 * recent fund events. Supports loading, error, and empty states.
 *
 * @module client/components/investments/InvestmentTimeline
 */

import { useFundContext } from '@/contexts/FundContext';
import { useTimelineData } from '@/hooks/useTimelineData';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

type InvestmentTimelineProps = {
  /** Fund ID to fetch timeline for (defaults to current fund) */
  fundId?: number;
  /** Maximum events to display (default: 6) */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
};

export default function InvestmentTimeline({
  fundId,
  limit = 6,
  className,
}: InvestmentTimelineProps) {
  const { fundId: contextFundId } = useFundContext();
  const resolvedFundId = fundId ?? contextFundId ?? 0;

  const { data, isLoading, error } = useTimelineData(resolvedFundId, { limit });
  const events = data?.events ?? [];

  return (
    <Card
      data-testid="timeline"
      className={cn('border-presson-borderSubtle bg-presson-surface', className)}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-presson-text">
          Recent Activity
        </CardTitle>
        <CardDescription className="text-presson-textMuted">
          Latest fund events and updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse flex items-center space-x-4 rounded-lg border border-presson-borderSubtle bg-presson-surfaceSubtle p-4"
              >
                <div className="h-9 w-9 rounded-full bg-presson-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-presson-surface" />
                  <div className="h-3 w-1/2 rounded bg-presson-surface" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-presson-negative py-4 text-center">
            Unable to load recent events.
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {events.slice(0, limit).map((event) => (
              <div
                key={event.id}
                data-testid="timeline-item"
                className="flex items-center justify-between rounded-lg border border-presson-borderSubtle bg-presson-surfaceSubtle p-3"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-presson-highlight flex items-center justify-center flex-shrink-0">
                    <Activity className="h-4 w-4 text-presson-accent" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-presson-text truncate">
                      {event.eventType}
                    </div>
                    <div className="text-xs text-presson-textMuted truncate">
                      {event.operation} &bull; {event.entityType}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-xs font-medium text-presson-text">
                    {format(parseISO(event.eventTime), 'MMM dd, yyyy')}
                  </div>
                  <div className="text-[10px] text-presson-textMuted">
                    {format(parseISO(event.eventTime), 'HH:mm:ss')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-sm text-presson-textMuted py-6">
            No recent activity yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
