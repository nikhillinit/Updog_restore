/**
 * LP Context Provider
 *
 * Manages LP profile state, selected fund filter, and data loading states
 * for the Limited Partner reporting dashboard.
 *
 * @module client/contexts/LPContext
 */

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import type { LPProfile, LPProfileResponse } from '@shared/types/lp-api';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface LPContextType {
  lpProfile: LPProfile | null;
  setLPProfile: (_profile: LPProfile | null) => void;
  selectedFundId: number | null;
  setSelectedFundId: (_fundId: number | null) => void;
  isLoading: boolean;
  error: Error | null;
  lpId: number | null;
  activeFundIds: number[];
}

const LPContext = createContext<LPContextType | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface LPProviderProps {
  children: ReactNode;
  /** Optional LP ID override (e.g., from route params) */
  lpId?: number;
}

export function LPProvider({ children, lpId: providedLpId }: LPProviderProps) {
  const [lpProfile, setLPProfile] = useState<LPProfile | null>(null);
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null);
  const [lpId, setLpId] = useState<number | null>(providedLpId || null);

  // Fetch LP profile data
  const {
    data: profileData,
    isLoading,
    error,
  } = useQuery<LPProfileResponse, Error>({
    queryKey: ['/api/lp/profile', lpId],
    queryFn: async () => {
      // In demo mode or when no LP ID, return mock data
      if (!lpId) {
        logger.info('No LP ID provided, using demo profile', { context: 'LPContext' });

        const demoProfile: LPProfile = {
          id: 1,
          name: 'Demo Limited Partner',
          email: 'demo@lp.example.com',
          entityType: 'llc',
          commitments: [
            {
              fundId: 1,
              fundName: 'Demo Fund I (VC Platform)',
              commitmentAmount: 1000000,
              commitmentDate: '2024-01-01',
              status: 'active',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return {
          profile: demoProfile,
          meta: {
            totalCommitments: 1000000,
            activeFunds: 1,
          },
        };
      }

      const response = await fetch(`/api/lp/profile?lpId=${lpId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch LP profile`);
      }

      return response.json();
    },
    enabled: true,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    retry: false,
  });

  // Update LP profile when data changes
  useEffect(() => {
    if (profileData?.profile) {
      setLPProfile(profileData.profile);
      if (!lpId) {
        setLpId(profileData.profile.id);
      }

      // Auto-select first active fund if none selected
      if (!selectedFundId && profileData.profile.commitments.length > 0) {
        const firstActiveFund = profileData.profile.commitments.find(
          (c) => c.status === 'active'
        );
        if (firstActiveFund) {
          setSelectedFundId(firstActiveFund.fundId);
        }
      }
    }
  }, [profileData, lpId, selectedFundId]);

  // Compute active fund IDs
  const activeFundIds = lpProfile?.commitments
    .filter((c) => c.status === 'active')
    .map((c) => c.fundId) || [];

  const value: LPContextType = {
    lpProfile,
    setLPProfile,
    selectedFundId,
    setSelectedFundId,
    isLoading,
    error,
    lpId,
    activeFundIds,
  };

  return <LPContext.Provider value={value}>{children}</LPContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access LP context
 *
 * @throws {Error} If used outside LPProvider
 *
 * @example
 * ```tsx
 * const { lpProfile, selectedFundId, setSelectedFundId } = useLPContext();
 * ```
 */
export function useLPContext() {
  const context = useContext(LPContext);
  if (context === undefined) {
    throw new Error('useLPContext must be used within a LPProvider');
  }
  return context;
}
