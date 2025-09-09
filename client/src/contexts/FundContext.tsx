/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface Fund {
  id: number;
  name: string;
  size: number;
  managementFee: number;
  carryPercentage: number;
  vintageYear: number;
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

export function FundProvider({ children }: FundProviderProps) {
  const [currentFund, setCurrentFund] = useState<Fund | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);

  // Fetch fund data
  const { data: funds, isLoading } = useQuery({
    queryKey: ['/api/funds'],
    enabled: true,
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
          setCurrentFund(funds[0]);
          setFundId(funds[0].id);
        }
      } else {
        // No selected fund ID, use first fund
        setCurrentFund(funds[0]);
        setFundId(funds[0].id);
      }
    } else if (!isLoading && (!funds || !Array.isArray(funds) || funds.length === 0)) {
      // No funds available
      setCurrentFund(null);
      setFundId(null);
    }
  }, [funds, fundId, isLoading]);

  const handleSetCurrentFund = (fund: Fund | null) => {
    setCurrentFund(fund);
    if (fund) {
      setFundId(fund.id);
    } else {
      setFundId(null);
    }
  };

  const needsSetup = !isLoading && !currentFund;

  const value: FundContextType = {
    currentFund,
    setCurrentFund: handleSetCurrentFund,
    isLoading,
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
