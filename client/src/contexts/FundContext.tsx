import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { logger } from '@/lib/logger';
import { extractFundResultsRouteId } from '@/lib/fund-routes';
import { isDemoMode as resolveDemoMode } from '@/core/demo/persona';

export interface Fund {
  id: number;
  name: string;
  size: number;
  managementFee: number;
  carryPercentage: number;
  vintageYear: number;
  establishmentDate?: string; // ISO date string for fund establishment
  deployedCapital: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  termYears?: number;
}

interface FundContextType {
  currentFund: Fund | null;
  setCurrentFund: (_fund: Fund | null) => void;
  isLoading: boolean;
  needsSetup: boolean;
  fundId: number | null;
  isDemoMode: boolean;
}

const FundContext = createContext<FundContextType | undefined>(undefined);

interface FundProviderProps {
  children: ReactNode;
}

export function FundProvider({ children }: FundProviderProps) {
  const [currentFund, setCurrentFund] = useState<Fund | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const isDemoMode = resolveDemoMode();

  const [location] = useLocation();
  const routeFundId = React.useMemo(() => extractFundResultsRouteId(location), [location]);

  // Fetch fund data
  const {
    data: funds,
    isLoading,
    error,
  } = useQuery<Fund[]>({
    queryKey: ['/api/funds'],
    enabled: true,
    retry: false, // Don't retry failed requests in demo mode
  });

  // Update current fund when funds data changes
  useEffect(() => {
    if (funds && Array.isArray(funds) && funds.length > 0) {
      const preferredFundId = routeFundId ?? fundId;

      if (preferredFundId) {
        // Find specific fund by ID
        const fund = funds.find((f: Fund) => f.id === preferredFundId);
        if (fund) {
          setCurrentFund(fund);
          if (fundId !== fund.id) {
            setFundId(fund.id);
          }
        } else {
          // On route-addressed results pages, do not overwrite the identity with
          // an unrelated "first fund". Let the route-specific page resolve truth.
          if (routeFundId != null) {
            return;
          }

          setCurrentFund(funds[0]!);
          setFundId(funds[0]!.id);
        }
      } else {
        // No selected fund ID, use first fund
        setCurrentFund(funds[0]!);
        setFundId(funds[0]!.id);
      }
    } else if (!isLoading && (error || !funds || !Array.isArray(funds) || funds.length === 0)) {
      logger.info('No fund context available; requiring setup', { context: 'FundContext' });
      setCurrentFund(null);
      setFundId(null);
    }
  }, [funds, fundId, routeFundId, isLoading, error]);

  const handleSetCurrentFund = (fund: Fund | null) => {
    setCurrentFund(fund);
    if (fund) {
      setFundId(fund.id);
    } else {
      setFundId(null);
    }
  };

  const hasResolvedFunds = Array.isArray(funds) && funds.length > 0;
  const awaitingResolvedFundSelection = hasResolvedFunds && !currentFund && routeFundId == null;

  // Consider "loading" until the first resolved fund has been copied into context
  // or demo mode has fully initialized. This prevents ProtectedRoute/HomeRoute from
  // redirecting to /fund-setup during the fetch -> effect handoff.
  const isInitializing = isLoading || awaitingResolvedFundSelection;
  const needsSetup = !isInitializing && !currentFund && routeFundId == null && !isDemoMode;

  const value: FundContextType = {
    currentFund,
    setCurrentFund: handleSetCurrentFund,
    isLoading: isInitializing,
    needsSetup,
    fundId,
    isDemoMode,
  };

  return <FundContext.Provider value={value}>{children}</FundContext.Provider>;
}

export function useFundContext() {
  const context = useContext(FundContext);
  if (context === undefined) {
    throw new Error('useFundContext must be used within a FundProvider');
  }
  return context;
}

// Legacy hook for backward compatibility
export function useFundData() {
  const { currentFund, isLoading, needsSetup } = useFundContext();

  return {
    funds: currentFund ? [currentFund] : [],
    isLoading,
    hasFundData: !!currentFund,
    needsSetup,
    primaryFund: currentFund,
  };
}
