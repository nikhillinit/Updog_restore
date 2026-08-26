import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FundSetup from '@/pages/fund-setup';
import { createWouterWrapper } from './withWouter';

/**
 * Renders FundSetup with fresh instances of location and QueryClient
 * This ensures test isolation and prevents state leakage between tests
 */
export function renderFundSetup(path = '/fund-setup?step=2') {
  // Create fresh instances for each render
  const { Wrapper } = createWouterWrapper(path);
  const client = new QueryClient({ 
    defaultOptions: { 
      queries: { 
        retry: false, 
        suspense: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      }
    } 
  });
  
  return render(
    <QueryClientProvider client={client}>
      <Wrapper>
        <FundSetup />
      </Wrapper>
    </QueryClientProvider>
  );
}