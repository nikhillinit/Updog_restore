// client/src/hooks/useSingleFlightMetrics.ts
// React hook for monitoring singleflight deduplication metrics

import { useEffect, useState } from 'react';
import { httpSingleFlight, getInflightCount } from '../lib/dedupedFetch';

export interface SingleFlightMetrics {
  inflightCount: number;
  capacity: number;
  utilizationPercent: number;
  isNearCapacity: boolean;
}

/**
 * Hook to monitor singleflight deduplication metrics.
 * Updates every `intervalMs` milliseconds.
 */
export function useSingleFlightMetrics(intervalMs = 1000): SingleFlightMetrics {
  const [metrics, setMetrics] = useState<SingleFlightMetrics>({
    inflightCount: 0,
    capacity: 500, // Match the capacity in dedupedFetch.ts
    utilizationPercent: 0,
    isNearCapacity: false,
  });

  useEffect(() => {
    const updateMetrics = () => {
      const count = getInflightCount();
      const capacity = 500; // Should match dedupedFetch configuration
      const utilization = (count / capacity) * 100;
      
      setMetrics({
        inflightCount: count,
        capacity,
        utilizationPercent: Math.round(utilization),
        isNearCapacity: utilization > 80,
      });
    };

    // Initial update
    updateMetrics();

    // Set up interval
    const interval = setInterval(updateMetrics, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs]);

  return metrics;
}

/**
 * Get current singleflight metrics (non-reactive).
 */
export function getSingleFlightMetrics(): SingleFlightMetrics {
  const count = getInflightCount();
  const capacity = 500;
  const utilization = (count / capacity) * 100;
  
  return {
    inflightCount: count,
    capacity,
    utilizationPercent: Math.round(utilization),
    isNearCapacity: utilization > 80,
  };
}