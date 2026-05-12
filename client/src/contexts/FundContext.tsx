import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { logger } from '@/lib/logger';
import { extractRouteScopedFundId, getLocationPathname } from '@/lib/fund-routes';
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
  fundLoadError: boolean;
  fundLoadErrorMessage: string | null;
  fundId: number | null;
  isDemoMode: boolean;
}

const FundContext = createContext<FundContextType | undefined>(undefined);
type FundSelectionSource = 'implicit' | 'explicit' | 'route' | 'singleton' | 'demo' | null;
const DEMO_ACTIVE_FUND_NAME = 'Test Fund I';

interface FundProviderProps {
  children: ReactNode;
}

export function FundProvider({ children }: FundProviderProps) {
  const [currentFund, setCurrentFund] = useState<Fund | null>(null);
  const [fundId, setFundId] = useState<number | null>(null);
  const [fundSelectionSource, setFundSelectionSource] = useState<FundSelectionSource>(null);
  const isDemoMode = resolveDemoMode();

  const [location] = useLocation();
  const search = useSearch();
  const routeFundId = React.useMemo(
    () => extractRouteScopedFundId(location, search),
    [location, search]
  );
  const pathname = React.useMemo(() => getLocationPathname(location), [location]);
  // Deterministic model routes must not silently inherit an implicit first-fund
  // selection from unrelated surfaces like /dashboard.
  const suppressImplicitFundSelection =
    pathname === '/financial-modeling' ||
    pathname === '/forecasting' ||
    pathname === '/model-results';

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
      // Keep route-addressed or explicitly chosen funds, but ignore any carried
      // implicit first-fund selection on the canonical deterministic route.
      const suppressesImplicitFirstFund =
        suppressImplicitFundSelection && fundSelectionSource === 'implicit' && !isDemoMode;
      const hasSafeSingletonRecovery =
        suppressImplicitFundSelection && !isDemoMode && routeFundId == null && funds.length === 1;
      const applyFundSelection = (fund: Fund, source: FundSelectionSource) => {
        setCurrentFund(fund);
        setFundId(fund.id);
        setFundSelectionSource(source);
      };
      const recoverSingletonFund = () => {
        applyFundSelection(funds[0]!, 'singleton');
      };
      const getDefaultFundSelection = (): { fund: Fund; source: FundSelectionSource } | null => {
        if (isDemoMode) {
          const demoFund = funds.find((fund) => fund.name === DEMO_ACTIVE_FUND_NAME);
          if (demoFund) {
            return { fund: demoFund, source: 'demo' };
          }

          if (suppressImplicitFundSelection && funds.length > 1) {
            return null;
          }
        }

        return { fund: funds[0]!, source: 'implicit' };
      };
      const preferredFundId = routeFundId ?? (suppressesImplicitFirstFund ? null : fundId);

      if (preferredFundId) {
        // Find specific fund by ID
        const fund = funds.find((f: Fund) => f.id === preferredFundId);
        if (fund) {
          applyFundSelection(fund, routeFundId != null ? 'route' : fundSelectionSource);
          if (routeFundId != null) {
            setFundSelectionSource('route');
          }
        } else {
          // On route-addressed results pages, do not overwrite the identity with
          // an unrelated "first fund". Let the route-specific page resolve truth.
          if (routeFundId != null) {
            return;
          }

          if (suppressImplicitFundSelection && !isDemoMode) {
            if (hasSafeSingletonRecovery) {
              recoverSingletonFund();
              return;
            }

            setCurrentFund(null);
            setFundId(null);
            setFundSelectionSource(null);
            return;
          }

          const defaultSelection = getDefaultFundSelection();
          if (!defaultSelection) {
            setCurrentFund(null);
            setFundId(null);
            setFundSelectionSource(null);
            return;
          }
          applyFundSelection(defaultSelection.fund, defaultSelection.source);
        }
      } else {
        if (suppressImplicitFundSelection && !isDemoMode) {
          if (hasSafeSingletonRecovery) {
            recoverSingletonFund();
            return;
          }

          setCurrentFund(null);
          setFundId(null);
          setFundSelectionSource(null);
          return;
        }

        // No selected fund ID, use first fund
        const defaultSelection = getDefaultFundSelection();
        if (!defaultSelection) {
          setCurrentFund(null);
          setFundId(null);
          setFundSelectionSource(null);
          return;
        }
        applyFundSelection(defaultSelection.fund, defaultSelection.source);
      }
    } else if (!isLoading && (error || !funds || !Array.isArray(funds) || funds.length === 0)) {
      logger.info('No fund context available; requiring setup', { context: 'FundContext' });
      setCurrentFund(null);
      setFundId(null);
      setFundSelectionSource(null);
    }
  }, [
    funds,
    fundId,
    routeFundId,
    isLoading,
    error,
    suppressImplicitFundSelection,
    fundSelectionSource,
    isDemoMode,
  ]);

  const handleSetCurrentFund = (fund: Fund | null) => {
    setCurrentFund(fund);
    if (fund) {
      setFundId(fund.id);
      setFundSelectionSource('explicit');
    } else {
      setFundId(null);
      setFundSelectionSource(null);
    }
  };

  const hasResolvedFunds = Array.isArray(funds) && funds.length > 0;
  const fundLoadError = !isLoading && error != null;
  const fundLoadErrorMessage =
    error instanceof Error ? error.message : fundLoadError ? 'Unable to load funds' : null;
  const awaitingResolvedFundSelection =
    hasResolvedFunds && !currentFund && routeFundId == null && !suppressImplicitFundSelection;
  const awaitingSingletonRecovery =
    hasResolvedFunds &&
    !currentFund &&
    routeFundId == null &&
    suppressImplicitFundSelection &&
    !isDemoMode &&
    funds.length === 1;
  const allowsMissingActiveFund =
    hasResolvedFunds &&
    !currentFund &&
    routeFundId == null &&
    suppressImplicitFundSelection &&
    !awaitingSingletonRecovery;

  // Consider "loading" until the first resolved fund has been copied into context
  // or demo mode has fully initialized. This prevents ProtectedRoute/HomeRoute from
  // redirecting to /fund-setup during the fetch -> effect handoff.
  const isInitializing = isLoading || awaitingResolvedFundSelection || awaitingSingletonRecovery;
  const needsSetup =
    !isInitializing &&
    !currentFund &&
    routeFundId == null &&
    !isDemoMode &&
    !allowsMissingActiveFund;

  const value: FundContextType = {
    currentFund,
    setCurrentFund: handleSetCurrentFund,
    isLoading: isInitializing,
    needsSetup,
    fundLoadError,
    fundLoadErrorMessage,
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
