import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

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
}

const FundContext = createContext<FundContextType | undefined>(undefined);

interface FundProviderProps {
  children: ReactNode;
}

// Demo fund used when API is unavailable
const DEMO_FUND: Fund = {
  id: 1,
  name: 'Demo Fund I (VC Platform)',
  size: 20000000, // $20M default
  managementFee: 0.025, // 2.5%
  carryPercentage: 0.20, // 20%
  vintageYear: 2024,
  deployedCapital: 0, // No deployed capital yet
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  termYears: 10
};

export function FundProvider({ children }: FundProviderProps) {
  const [currentFund, setCurrentFund] = useState<Fund | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [demoModeInitialized, setDemoModeInitialized] = useState(false);

  // Fetch fund data
  const { data: funds, isLoading, error } = useQuery({
    queryKey: ['/api/funds'],
    enabled: true,
    retry: false, // Don't retry failed requests in demo mode
  });

  // Update current fund when funds data changes
  useEffect(() => {
    if (funds && Array.isArray(funds) && funds.length > 0) {
      if (fundId) {
        // Find specific fund by ID
        const fund = funds.find((f: Fund) => f.id === fundId);
        if (fund) {
          setCurrentFund(fund);
        } else {
          // Fallback to first fund if ID not found
          setCurrentFund(funds[0]!);
          setFundId(funds[0]!.id);
        }
      } else {
        // No selected fund ID, use first fund
        setCurrentFund(funds[0]!);
        setFundId(funds[0]!.id);
      }
    } else if (!isLoading && (error || !funds || !Array.isArray(funds) || funds.length === 0)) {
      // Demo mode: Create a fallback fund when API is unavailable
      if (!demoModeInitialized) {
        logger.info('API unavailable, entering demo mode', { context: 'FundContext' });
        setCurrentFund(DEMO_FUND);
        setFundId(DEMO_FUND.id);
        setDemoModeInitialized(true);
      }
    }
  }, [funds, fundId, isLoading, error, demoModeInitialized]);

  const handleSetCurrentFund = (fund: Fund | null) => {
    setCurrentFund(fund);
    if (fund) {
      setFundId(fund.id);
    } else {
      setFundId(null);
    }
  };

  // Consider "loading" until we have a fund OR demo mode is fully initialized
  // This prevents race condition where ProtectedRoute redirects before demo fund is set
  const isInitializing = isLoading || (!currentFund && !demoModeInitialized && (!!error || !funds));
  const needsSetup = !isInitializing && !currentFund;

  const value: FundContextType = {
    currentFund,
    setCurrentFund: handleSetCurrentFund,
    isLoading: isInitializing,
    needsSetup,
    fundId,
  };

  return (
    <FundContext.Provider value={value}>
      {children}
    </FundContext.Provider>
  );
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
