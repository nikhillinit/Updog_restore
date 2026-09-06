import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';

export const FundSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  size: z.number().finite(),
  deployedCapital: z.number().finite(),
  managementFee: z.number().finite(),
  carryPercentage: z.number().finite(),
  vintageYear: z.number().int(),
  status: z.string().min(1),
  engineResults: z.unknown().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable().optional(),
  establishmentDate: z.string().nullable(),
  isActive: z.boolean(),
  termYears: z.number().finite().optional(),
});

export const FundSummariesSchema = z.array(FundSummarySchema);
export interface Fund {
  id: number;
  name: string;
  size: number;
  deployedCapital: number;
  managementFee: number;
  carryPercentage: number;
  vintageYear: number;
  status: string;
  engineResults?: unknown;
  createdAt: string | null;
  updatedAt?: string | null;
  establishmentDate?: string | null;
  isActive?: boolean;
  termYears?: number;
}

export const FUNDS_QUERY_KEY = ['/api/funds'] as const;

export async function fetchFundSummaries(): Promise<Fund[]> {
  return FundSummariesSchema.parse(await apiRequest<unknown>('GET', '/api/funds')) as Fund[];
}
