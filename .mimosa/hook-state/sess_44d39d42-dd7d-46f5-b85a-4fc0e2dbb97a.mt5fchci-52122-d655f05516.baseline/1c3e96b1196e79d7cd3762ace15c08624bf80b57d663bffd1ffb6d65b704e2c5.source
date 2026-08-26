/**
 * Reserves v1.1 Calculation Engine
 * - Configurable reserve percentage
 * - Optional "remain" pass for additional allocation
 * - Integer cents for precision
 * - Exit MOIC-based ranking
 * - Comprehensive audit trail
 */

import type {
  AllocationDecision,
  Company,
  ReservesConfig,
  ReservesInput,
  ReservesOutput,
  ReservesResult,
} from '@shared/types/reserves-v11';

const DEFAULT_CAP_PERCENT = 0.5;

function getDefaultCapPercent(config: ReservesConfig): number {
  return config.cap_policy.default_percent ?? DEFAULT_CAP_PERCENT;
}

function getCapPercent(company: Company, config: ReservesConfig): number {
  const defaultPercent = getDefaultCapPercent(config);

  if (config.cap_policy.kind !== 'stage_based') {
    return defaultPercent;
  }

  const stage = company.stage ?? 'unknown';
  return config.cap_policy.stage_caps?.[stage] ?? defaultPercent;
}

function calculateCap(company: Company, config: ReservesConfig): number {
  switch (config.cap_policy.kind) {
    case 'fixed_percent': {
      return Math.floor(company.invested_cents * getDefaultCapPercent(config));
    }

    case 'stage_based': {
      return Math.floor(company.invested_cents * getCapPercent(company, config));
    }

    case 'custom': {
      if (config.cap_policy.custom_fn) {
        return config.cap_policy.custom_fn(company);
      }
      return Math.floor(company.invested_cents * DEFAULT_CAP_PERCENT);
    }

    default:
      return Math.floor(company.invested_cents * DEFAULT_CAP_PERCENT);
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
    if (input.companies.length === 0) {
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
            exit_moic_ranking: [],
          },
        },
        warnings: ['No companies provided'],
        metrics: {
          duration_ms: performance.now() - startTime,
          company_count: 0,
          policy_type: config.cap_policy.kind,
        },
      };
    }

    const totalInitial = input.companies.reduce((sum, company) => sum + company.invested_cents, 0);
    const available = Math.floor((totalInitial * config.reserve_bps) / 10_000);
    let remaining = available;

    const ranked = [...input.companies].sort((a, b) => {
      if (b.exit_moic_bps !== a.exit_moic_bps) {
        return b.exit_moic_bps - a.exit_moic_bps;
      }

      return b.invested_cents - a.invested_cents;
    });

    const exitMoicRanking = ranked.map((company) => company.id);
    const exitMoicRankingIndex = new Map(
      exitMoicRanking.map((companyId, index) => [companyId, index + 1] as const)
    );
    const allocations: AllocationDecision[] = [];
    const companyAllocations = new Map<string, number>();

    const performAllocationPass = (iteration: number) => {
      for (const company of ranked) {
        if (remaining <= 0) {
          break;
        }

        const cap = calculateCap(company, config);
        const already = companyAllocations.get(company.id) ?? 0;
        const room = Math.max(0, cap - already);

        if (room <= 0) {
          continue;
        }

        const allot = Math.min(remaining, room);

        if (allot > 0) {
          const newTotal = already + allot;
          companyAllocations.set(company.id, newTotal);

          const rankingPosition = exitMoicRankingIndex.get(company.id) ?? 0;
          const reason = `Ranked #${rankingPosition} by Exit MOIC (${company.exit_moic_bps / 100}%), iteration ${iteration}`;
          const existingIndex = allocations.findIndex(
            (allocation) => allocation.company_id === company.id
          );

          if (existingIndex >= 0) {
            allocations[existingIndex] = {
              company_id: company.id,
              planned_cents: newTotal,
              reason,
              cap_cents: cap,
              iteration,
            };
          } else {
            allocations.push({
              company_id: company.id,
              planned_cents: allot,
              reason,
              cap_cents: cap,
              iteration,
            });
          }

          remaining -= allot;
        }
      }
    };

    performAllocationPass(1);

    if (config.remain_passes === 1 && remaining > 0) {
      performAllocationPass(2);
    }

    const totalAllocated = allocations.reduce(
      (sum, allocation) => sum + allocation.planned_cents,
      0
    );

    const conservationCheck = Math.abs(totalAllocated + remaining - available) <= 1;

    if (!conservationCheck) {
      warnings.push(
        `Conservation check failed: allocated=${totalAllocated}, remaining=${remaining}, available=${available}`
      );
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
        exit_moic_ranking: exitMoicRanking,
      },
    };

    return {
      ok: true,
      data: output,
      ...(warnings.length > 0 ? { warnings } : {}),
      metrics: {
        duration_ms: performance.now() - startTime,
        company_count: input.companies.length,
        policy_type: config.cap_policy.kind,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        duration_ms: performance.now() - startTime,
        company_count: input.companies.length,
        policy_type: config.cap_policy.kind,
      },
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
      default_percent: 0.5,
    },
    audit_level: 'basic',
  };

  const input: ReservesInput = {
    companies,
    fund_size_cents: companies.reduce((sum, company) => sum + company.invested_cents, 0),
    quarter_index: new Date().getFullYear() * 4 + Math.floor(new Date().getMonth() / 3),
  };

  return calculateReservesSafe(input, config);
}
