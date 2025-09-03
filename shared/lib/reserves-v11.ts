/**
 * Reserves v1.1 Calculation Engine
 * - Configurable reserve percentage
 * - Optional "remain" pass for additional allocation
 * - Integer cents for precision
 * - Exit MOIC-based ranking
 * - Comprehensive audit trail
 */

import type {
  Company,
  ReservesConfig,
  ReservesInput,
  ReservesOutput,
  ReservesResult,
  AllocationDecision,
  CapPolicy
} from '@shared/types/reserves-v11';

// Helper function to calculate cap for a company
function calculateCap(company: Company, config: ReservesConfig): number {
  const { cap_policy } = config;
  
  switch (cap_policy.kind) {
    case 'fixed_percent': {
      const percent = cap_policy.default_percent || 0.5; // Default 50%
      return Math.floor((company.invested_cents || 0) * percent);
    }
    
    case 'stage_based': {
      const stage = company.stage || 'unknown';
      const caps = cap_policy.stage_caps || {};
      const percent = caps[stage] || cap_policy.default_percent || 0.5;
      return Math.floor((company.invested_cents || 0) * percent);
    }
    
    case 'custom': {
      if (cap_policy.custom_fn) {
        return cap_policy.custom_fn(company);
      }
      return Math.floor((company.invested_cents || 0) * 0.5);
    }
    
    default:
      return Math.floor((company.invested_cents || 0) * 0.5);
  }
}

// Main calculation function with safety and invariants
export function calculateReservesSafe(
  input: ReservesInput,
  config: ReservesConfig
): ReservesResult {
  const startTime = performance.now();
  const warnings: string[] = [];
  
  try {
    // Input validation
    if (!input.companies || input.companies.length === 0) {
      return {
        ok: true,
        data: {
          allocations: [],
          remaining_cents: 0,
          metadata: {
            total_available_cents: 0,
            total_allocated_cents: 0,
            companies_funded: 0,
            max_iterations: 0,
            conservation_check: true,
            exit_moic_ranking: []
          }
        },
        warnings: ['No companies provided'],
        metrics: {
          duration_ms: performance.now() - startTime,
          company_count: 0,
          policy_type: config.cap_policy.kind
        }
      };
    }
    
    // Calculate total available reserves
    const totalInitial = input.companies.reduce((sum, c) => sum + (c.invested_cents || 0), 0);
    const available = Math.floor((totalInitial * config.reserve_bps) / 10_000);
    let remaining = available;
    
    // Rank companies by Exit MOIC (descending)
    const ranked = [...input.companies].sort((a, b) => {
      const moicA = a.exit_moic_bps || 0;
      const moicB = b.exit_moic_bps || 0;
      if (moicB !== moicA) return moicB - moicA;
      // Secondary sort by invested amount for stability
      return (b.invested_cents || 0) - (a.invested_cents || 0);
    });
    
    const exitMoicRanking = ranked.map(c => c.id);
    const allocations: AllocationDecision[] = [];
    const companyAllocations = new Map<string, number>();
    
    // Single allocation pass
    const performAllocationPass = (iteration: number) => {
      for (const company of ranked) {
        if (remaining <= 0) break;
        
        const cap = calculateCap(company, config);
        const already = companyAllocations.get(company.id) || 0;
        const room = Math.max(0, cap - already);
        
        if (room <= 0) continue;
        
        const allot = Math.min(remaining, room);
        
        if (allot > 0) {
          const newTotal = already + allot;
          companyAllocations.set(company.id, newTotal);
          
          // Find and update existing allocation or create new
          const existingIndex = allocations.findIndex(a => a.company_id === company.id);
          
          if (existingIndex >= 0) {
            allocations[existingIndex] = {
              company_id: company.id,
              planned_cents: newTotal,
              reason: `Ranked #${exitMoicRanking.indexOf(company.id) + 1} by Exit MOIC (${(company.exit_moic_bps || 0) / 100}%), iteration ${iteration}`,
              cap_cents: cap,
              iteration
            };
          } else {
            allocations.push({
              company_id: company.id,
              planned_cents: allot,
              reason: `Ranked #${exitMoicRanking.indexOf(company.id) + 1} by Exit MOIC (${(company.exit_moic_bps || 0) / 100}%), iteration ${iteration}`,
              cap_cents: cap,
              iteration
            });
          }
          
          remaining -= allot;
        }
      }
    };
    
    // First pass
    performAllocationPass(1);
    
    // Optional "remain" pass
    if (config.remain_passes === 1 && remaining > 0) {
      performAllocationPass(2);
    }
    
    // Calculate totals for invariant checking
    const totalAllocated = allocations.reduce((sum, a) => sum + a.planned_cents, 0);
    
    // Conservation invariant check
    const conservationCheck = Math.abs((totalAllocated + remaining) - available) <= 1; // Allow 1 cent rounding
    
    if (!conservationCheck) {
      warnings.push(`Conservation check failed: allocated=${totalAllocated}, remaining=${remaining}, available=${available}`);
      // Normalize to maintain invariant
      remaining = Math.max(0, available - totalAllocated);
    }
    
    const output: ReservesOutput = {
      allocations,
      remaining_cents: remaining,
      metadata: {
        total_available_cents: available,
        total_allocated_cents: totalAllocated,
        companies_funded: allocations.length,
        max_iterations: config.remain_passes === 1 ? 2 : 1,
        conservation_check: conservationCheck,
        exit_moic_ranking: exitMoicRanking
      }
    };
    
    return {
      ok: true,
      data: output,
      warnings: warnings.length > 0 ? warnings : undefined,
      metrics: {
        duration_ms: performance.now() - startTime,
        company_count: input.companies.length,
        policy_type: config.cap_policy.kind
      }
    };
    
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        duration_ms: performance.now() - startTime,
        company_count: input.companies.length,
        policy_type: config.cap_policy.kind
      }
    };
  }
}

// Export a simpler interface for common use cases
export function calculateReserves(
  companies: Company[],
  reservePercent: number,
  enableRemainPass: boolean = false
): ReservesResult {
  const config: ReservesConfig = {
    reserve_bps: Math.round(reservePercent * 10000),
    remain_passes: enableRemainPass ? 1 : 0,
    cap_policy: {
      kind: 'fixed_percent',
      default_percent: 0.5
    },
    audit_level: 'basic'
  };
  
  const input: ReservesInput = {
    companies,
    fund_size_cents: companies.reduce((sum, c) => sum + (c.invested_cents || 0), 0),
    quarter_index: new Date().getFullYear() * 4 + Math.floor(new Date().getMonth() / 3)
  };
  
  return calculateReservesSafe(input, config);
}