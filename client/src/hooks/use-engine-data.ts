import { useState, useEffect } from 'react';

export interface ReserveAllocation {
  allocation: number;
  confidence: number;
  rationale: string;
}

export interface PacingDeployment {
  quarter: number;
  deployment: number;
  note: string;
}

export function useReserveData(fundId: number) {
  const [data, setData] = useState<ReserveAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReserveData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/reserves/${fundId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
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
  const [data, setData] = useState<PacingDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPacingData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/pacing/summary');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
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