import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const defaultQueryFn = async ({ queryKey }: { queryKey: any[] }) => {
  const url = typeof queryKey[0] === 'string' ? queryKey[0] : '';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: defaultQueryFn } },
  });
}

export function TestQueryClientProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => createTestQueryClient(), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}