import { useState, useEffect } from 'react';
import type { ReserveSummary, PacingSummary, ApiError } from '@shared/types';

export function useReserveData(fundId: number) {
  const [data, setData] = useState<ReserveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReserveData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/reserves/${fundId}`);
        
        if (!response.ok) {
          const errorData: ApiError = await response.json();
          throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }
        
        const result: ReserveSummary = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch reserve data');
      } finally {
        setLoading(false);
      }
    };

    if (fundId) {
      fetchReserveData();
    }
  }, [fundId]);

  return { data, loading, error };
}

export function usePacingData() {
  const [data, setData] = useState<PacingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPacingData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/pacing/summary');
        
        if (!response.ok) {
          const errorData: ApiError = await response.json();
          throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
        }
        
        const result: PacingSummary = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch pacing data');
      } finally {
        setLoading(false);
      }
    };

    fetchPacingData();
  }, []);

  return { data, loading, error };
}