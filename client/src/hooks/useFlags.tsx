/**
 * Feature Flag Hook for React
 * Client-side flag consumption with SWR caching
 */

import { useQuery } from '@tanstack/react-query';

interface FlagResponse {
  flags: Record<string, boolean>;
  timestamp: string;
  _meta: {
    note: string;
  };
}

interface FlagStatus {
  cache: {
    age: number;
    hash: string;
    flagCount: number;
  };
  killSwitchActive: boolean;
  environment: string;
  timestamp: string;
}

/**
 * Fetch client-safe flags from API
 */
async function fetchFlags(): Promise<FlagResponse> {
  const response = await fetch('/api/flags');
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch flag system status
 */
async function fetchFlagStatus(): Promise<FlagStatus> {
  const response = await fetch('/api/flags/status');
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Hook to get all client-safe flags
 */
export function useFlags() {
  return useQuery({
    queryKey: ['flags'],
    queryFn: fetchFlags,
    staleTime: 25_000, // 25s (slightly less than server TTL of 30s)
    refetchInterval: 30_000, // Refetch every 30s
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors, do retry on network/5xx errors
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as Error).message;
        if (message.includes('HTTP 4')) return false;
      }
      return failureCount < 3;
    },
    // Safe fallback on error
    placeholderData: { flags: {}, timestamp: new Date().toISOString(), _meta: { note: 'Fallback - all flags disabled' } }
  });
}

/**
 * Hook to check if a specific flag is enabled
 */
export function useFlag(key: string): boolean {
  const { data } = useFlags();
  return data?.flags[key] ?? false;
}

/**
 * Hook to get flag system status (for debugging/monitoring)
 */
export function useFlagStatus() {
  return useQuery({
    queryKey: ['flags', 'status'],
    queryFn: fetchFlagStatus,
    staleTime: 60_000, // 1 minute
    refetchInterval: 120_000, // Every 2 minutes
    retry: 2
  });
}

/**
 * Component for flag debugging (development only)
 */
export function FlagDebugPanel() {
  const { data: flags, isLoading: flagsLoading } = useFlags();
  const { data: status, isLoading: statusLoading } = useFlagStatus();
  
  if (process.env['NODE_ENV'] !== 'development') {
    return null;
  }
  
  if (flagsLoading || statusLoading) {
    return <div className="text-sm text-gray-500">Loading flags...</div>;
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-3 rounded max-w-sm">
      <div className="font-bold mb-2">🚩 Feature Flags</div>
      
      <div className="space-y-1">
        {Object.entries(flags?.flags || {}).map(([key, enabled]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-300">{key}:</span>
            <span className={enabled ? 'text-green-400' : 'text-red-400'}>
              {enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        ))}
      </div>
      
      {status && (
        <div className="mt-3 pt-2 border-t border-gray-600">
          <div className="text-gray-400">
            Cache: {Math.round(status.cache.age / 1000)}s ago ({status.cache.hash})
          </div>
          {status.killSwitchActive && (
            <div className="text-red-400 font-bold">🚨 KILL SWITCH ACTIVE</div>
          )}
        </div>
      )}
    </div>
  );
}