/**
 * LP Calculator Service
 *
 * Business logic for LP reporting calculations:
 * - Dashboard summary metrics
 * - Pro-rata holdings calculations
 * - Capital account running balances
 * - Performance timeseries (IRR, MOIC)
 *
 * @module server/services/lp-calculator
 */

import { db } from '../db';
import { storage } from '../storage';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import {
  limitedPartners,
  lpFundCommitments,
  capitalActivities,
  lpCapitalAccounts,
  lpPerformanceSnapshots,
} from '@shared/schema-lp-reporting';
import { portfolioCompanies, investments } from '@shared/schema';
import { encryptField, decryptField } from '../lib/crypto/field-encryption';

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

/**
 * Thrown when optimistic locking version check fails
 *
 * Returns HTTP 409 Conflict to client with Retry-After header.
 * Client should re-fetch latest data and retry the operation.
 */
export class OptimisticLockError extends Error {
  constructor(
    message: string,
    public readonly resourceType: string,
    public readonly resourceId: number,
    public readonly expectedVersion: bigint,
    public readonly actualVersion: bigint
  ) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LPSummary {
  lpId: number;
  lpName: string;
  totalCommittedCents: bigint;
  totalCalledCents: bigint;
  totalDistributedCents: bigint;
  totalNAVCents: bigint;
  totalUnfundedCents: bigint;
  fundCount: number;
  irr: number | null;
  moic: number | null;
}

export interface LPProfile {
  id: number;
  name: string;
  email: string;
  entityType: string;
  taxId: string | null; // Decrypted taxId
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface ProRataHolding {
  companyId: number;
  companyName: string;
  sector: string;
  stage: string;
  lpSharePercentage: number; // LP's % of fund's % of company
  currentValuation: number;
  lpProRataValue: number;
}

export interface CapitalAccountTransaction {
  id: number;
  activityType: string;
  amountCents: bigint;
  activityDate: Date;
  effectiveDate: Date;
  description: string | null;
  runningBalanceCents: bigint;
}

export interface PerformanceTimeseries {
  date: string;
  irr: number | null;
  moic: number | null;
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  benchmarkIRR: number | null;
}

// ============================================================================
// LP CALCULATOR CLASS
// ============================================================================

export class LPCalculator {
  /**
   * Get LP profile with decrypted taxId
   *
   * @param lpId - Limited partner ID
   * @returns LP profile with decrypted sensitive fields
   * @throws Error if LP not found
   */
  async getProfile(lpId: number): Promise<LPProfile> {
    const lp = await db
      .select()
      .from(limitedPartners)
      .where(eq(limitedPartners.id, lpId))
      .limit(1);

    if (lp.length === 0) {
      throw new Error(`LP ${lpId} not found`);
    }

    const lpProfile = lp[0];
    if (!lpProfile) {
      throw new Error(`LP ${lpId} not found`);
    }

    // Decrypt taxId if present
    const decryptedTaxId = lpProfile.taxId
      ? await decryptField(lpProfile.taxId)
      : null;

    return {
      id: lpProfile.id,
      name: lpProfile.name,
      email: lpProfile.email,
      entityType: lpProfile.entityType,
      taxId: decryptedTaxId,
      address: lpProfile.address,
      contactName: lpProfile.contactName,
      contactEmail: lpProfile.contactEmail,
      contactPhone: lpProfile.contactPhone,
    };
  }

  /**
   * Create or update LP with encrypted taxId
   *
   * @param lpData - LP data with plaintext taxId
   * @returns Created/updated LP ID
   */
  async upsertLP(lpData: {
    id?: number;
    name: string;
    email: string;
    entityType: string;
    taxId?: string | null;
    address?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  }): Promise<number> {
    // Encrypt taxId if provided
    const encryptedTaxId = lpData.taxId
      ? await encryptField(lpData.taxId)
      : null;

    if (lpData.id) {
      // Update existing LP
      await db
        .update(limitedPartners)
        .set({
          name: lpData.name,
          email: lpData.email,
          entityType: lpData.entityType,
          taxId: encryptedTaxId,
          address: lpData.address,
          contactName: lpData.contactName,
          contactEmail: lpData.contactEmail,
          contactPhone: lpData.contactPhone,
          updatedAt: new Date(),
        })
        .where(eq(limitedPartners.id, lpData.id));

      return lpData.id;
    } else {
      // Create new LP
      const result = await db
        .insert(limitedPartners)
        .values({
          name: lpData.name,
          email: lpData.email,
          entityType: lpData.entityType,
          taxId: encryptedTaxId,
          address: lpData.address,
          contactName: lpData.contactName,
          contactEmail: lpData.contactEmail,
          contactPhone: lpData.contactPhone,
        })
        .returning({ id: limitedPartners.id });

      return result[0]?.id ?? 0;
    }
  }

  /**
   * Calculate summary metrics for an LP across all their fund commitments
   */
  async calculateSummary(lpId: number): Promise<LPSummary> {
    // Get LP profile
    const lp = await db
      .select()
      .from(limitedPartners)
      .where(eq(limitedPartners.id, lpId))
      .limit(1);

    if (lp.length === 0) {
      throw new Error(`LP ${lpId} not found`);
    }

    const lpProfile = lp[0];
    if (!lpProfile) {
      throw new Error(`LP ${lpId} not found`);
    }

    // Get all commitments
    const commitments = await db
      .select()
      .from(lpFundCommitments)
      .where(eq(lpFundCommitments.lpId, lpId));

    if (commitments.length === 0) {
      return {
        lpId,
        lpName: lpProfile.name,
        totalCommittedCents: BigInt(0),
        totalCalledCents: BigInt(0),
        totalDistributedCents: BigInt(0),
        totalNAVCents: BigInt(0),
        totalUnfundedCents: BigInt(0),
        fundCount: 0,
        irr: null,
        moic: null,
      };
    }

    // Get latest capital account for each commitment
    const commitmentIds = commitments.map((c) => c.id);
    const latestAccounts = await db
      .select()
      .from(lpCapitalAccounts)
      .where(inArray(lpCapitalAccounts.commitmentId, commitmentIds))
      .orderBy(desc(lpCapitalAccounts.asOfDate));

    // Aggregate metrics
    let totalCommittedCents = BigInt(0);
    let totalCalledCents = BigInt(0);
    let totalDistributedCents = BigInt(0);
    let totalNAVCents = BigInt(0);
    let totalUnfundedCents = BigInt(0);

    // Group accounts by commitment ID and take the latest
    const latestAccountMap = new Map<number, (typeof latestAccounts)[0]>();
    for (const account of latestAccounts) {
      if (!latestAccountMap.has(account.commitmentId)) {
        latestAccountMap.set(account.commitmentId, account);
      }
    }

    for (const commitment of commitments) {
      totalCommittedCents += commitment.commitmentAmountCents;

      const account = latestAccountMap.get(commitment.id);
      if (account) {
        totalCalledCents += account.calledCapitalCents;
        totalDistributedCents += account.distributedCapitalCents;
        totalNAVCents += account.navCents;
        totalUnfundedCents += account.unfundedCommitmentCents;
      }
    }

    // Calculate portfolio-level IRR and MOIC
    // For simplicity, use weighted average from latest performance snapshots
    const latestPerformance = await db
      .select()
      .from(lpPerformanceSnapshots)
      .where(inArray(lpPerformanceSnapshots.commitmentId, commitmentIds))
      .orderBy(desc(lpPerformanceSnapshots.snapshotDate));

    const perfMap = new Map<number, (typeof latestPerformance)[0]>();
    for (const perf of latestPerformance) {
      if (!perfMap.has(perf.commitmentId)) {
        perfMap.set(perf.commitmentId, perf);
      }
    }

    let weightedIRR = 0;
    let weightedMOIC = 0;
    let totalWeight = 0;

    for (const commitment of commitments) {
      const perf = perfMap.get(commitment.id);
      if (perf && perf.irr && perf.moic) {
        const weight = Number(commitment.commitmentAmountCents);
        weightedIRR += Number(perf.irr) * weight;
        weightedMOIC += Number(perf.moic) * weight;
        totalWeight += weight;
      }
    }

    const irr = totalWeight > 0 ? weightedIRR / totalWeight : null;
    const moic = totalWeight > 0 ? weightedMOIC / totalWeight : null;

    return {
      lpId,
      lpName: lpProfile.name,
      totalCommittedCents,
      totalCalledCents,
      totalDistributedCents,
      totalNAVCents,
      totalUnfundedCents,
      fundCount: commitments.length,
      irr,
      moic,
    };
  }

  /**
   * Calculate LP's pro-rata share of portfolio holdings for a specific fund
   */
  async calculateProRataHoldings(lpId: number, fundId: number): Promise<ProRataHolding[]> {
    // Get LP's commitment to this fund
    const commitment = await db
      .select()
      .from(lpFundCommitments)
      .where(and(eq(lpFundCommitments.lpId, lpId), eq(lpFundCommitments.fundId, fundId)))
      .limit(1);

    if (commitment.length === 0) {
      throw new Error(`LP ${lpId} has no commitment to fund ${fundId}`);
    }

    const commitmentData = commitment[0];
    if (!commitmentData) {
      throw new Error(`LP ${lpId} has no commitment to fund ${fundId}`);
    }

    // Get fund details to calculate LP's % of fund
    const fund = await storage.getFund(fundId);
    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const fundSizeCents = BigInt(Number(fund.size) * 100);
    const lpPercentageOfFund =
      Number(commitmentData.commitmentAmountCents) / Number(fundSizeCents);

    // Get all portfolio companies for this fund
    const companies = await db
      .select({
        id: portfolioCompanies.id,
        name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
        stage: portfolioCompanies.stage,
        currentValuation: portfolioCompanies.currentValuation,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId));

    // Get fund's ownership % for each company
    const companyIds = companies.map((c) => c.id);
    const investmentsData = await db
      .select({
        companyId: investments.companyId,
        ownershipPercentage: investments.ownershipPercentage,
      })
      .from(investments)
      .where(
        and(eq(investments.fundId, fundId), inArray(investments.companyId, companyIds))
      );

    // Build ownership map (sum all rounds for each company)
    const ownershipMap = new Map<number, number>();
    for (const inv of investmentsData) {
      if (inv.companyId && inv.ownershipPercentage) {
        const current = ownershipMap.get(inv.companyId) || 0;
        ownershipMap.set(inv.companyId, current + Number(inv.ownershipPercentage));
      }
    }

    // Calculate pro-rata holdings
    const holdings: ProRataHolding[] = [];

    for (const company of companies) {
      const fundOwnership = ownershipMap.get(company.id) || 0;
      const lpSharePercentage = lpPercentageOfFund * fundOwnership;
      const currentValuation = Number(company.currentValuation) || 0;
      const lpProRataValue = currentValuation * lpSharePercentage;

      holdings.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        stage: company.stage,
        lpSharePercentage,
        currentValuation,
        lpProRataValue,
      });
    }

    // Sort by pro-rata value descending
    holdings.sort((a, b) => b.lpProRataValue - a.lpProRataValue);

    return holdings;
  }

  /**
   * Calculate capital account balance as of a specific date
   */
  async calculateCapitalAccount(
    commitmentId: number,
    asOfDate: string
  ): Promise<CapitalAccountTransaction[]> {
    // Get all capital activities up to asOfDate
    const activities = await db
      .select({
        id: capitalActivities.id,
        activityType: capitalActivities.activityType,
        amountCents: capitalActivities.amountCents,
        activityDate: capitalActivities.activityDate,
        effectiveDate: capitalActivities.effectiveDate,
        description: capitalActivities.description,
      })
      .from(capitalActivities)
      .where(
        and(
          eq(capitalActivities.commitmentId, commitmentId),
          lte(capitalActivities.effectiveDate, new Date(asOfDate))
        )
      )
      .orderBy(capitalActivities.effectiveDate, capitalActivities.id);

    // Calculate running balance
    let runningBalanceCents = BigInt(0);
    const transactions: CapitalAccountTransaction[] = [];

    for (const activity of activities) {
      // Capital calls increase balance, distributions decrease
      if (activity.activityType === 'capital_call') {
        runningBalanceCents += activity.amountCents;
      } else if (
        activity.activityType === 'distribution' ||
        activity.activityType === 'recallable_distribution'
      ) {
        runningBalanceCents -= activity.amountCents;
      }

      transactions.push({
        id: activity.id,
        activityType: activity.activityType,
        amountCents: activity.amountCents,
        activityDate: activity.activityDate,
        effectiveDate: activity.effectiveDate,
        description: activity.description,
        runningBalanceCents,
      });
    }

    return transactions;
  }

  /**
   * Calculate performance metrics timeseries for a commitment
   */
  async calculatePerformance(
    commitmentId: number,
    startDate: string,
    endDate: string
  ): Promise<PerformanceTimeseries[]> {
    const snapshots = await db
      .select()
      .from(lpPerformanceSnapshots)
      .where(
        and(
          eq(lpPerformanceSnapshots.commitmentId, commitmentId),
          gte(lpPerformanceSnapshots.snapshotDate, new Date(startDate)),
          lte(lpPerformanceSnapshots.snapshotDate, new Date(endDate))
        )
      )
      .orderBy(lpPerformanceSnapshots.snapshotDate);

    return snapshots.map((snapshot) => ({
      date: snapshot.snapshotDate.toISOString().split('T')[0] ?? '',
      irr: snapshot.irr ? Number(snapshot.irr) : null,
      moic: snapshot.moic ? Number(snapshot.moic) : null,
      tvpi: snapshot.tvpi ? Number(snapshot.tvpi) : null,
      dpi: snapshot.dpi ? Number(snapshot.dpi) : null,
      rvpi: snapshot.rvpi ? Number(snapshot.rvpi) : null,
      benchmarkIRR: snapshot.benchmarkIRR ? Number(snapshot.benchmarkIRR) : null,
    }));
  }

  // ==========================================================================
  // OPTIMISTIC LOCKING VALIDATION (Defensive Layer for Future Updates)
  // ==========================================================================

  /**
   * Validate optimistic locking version before UPDATE operation
   *
   * CRITICAL: This method MUST be called before any UPDATE to tables with
   * version columns to prevent lost updates (anti-pattern AP-LOCK-03).
   *
   * @param resourceType - Table name for error messages
   * @param resourceId - Primary key of resource being updated
   * @param expectedVersion - Version from client's last read
   * @param actualVersion - Current version in database
   * @throws OptimisticLockError if versions don't match
   *
   * @example
   * ```typescript
   * // Before UPDATE:
   * const current = await db.select().from(lpReports).where(eq(lpReports.id, id));
   * this.validateVersion('lpReports', id, clientVersion, current[0].version);
   *
   * // Then execute UPDATE with version increment:
   * await db.update(lpReports)
   *   .set({ status: 'ready', version: sql`${lpReports.version} + 1` })
   *   .where(and(eq(lpReports.id, id), eq(lpReports.version, expectedVersion)));
   * ```
   */
  validateVersion(
    resourceType: string,
    resourceId: number,
    expectedVersion: bigint,
    actualVersion: bigint
  ): void {
    if (expectedVersion !== actualVersion) {
      throw new OptimisticLockError(
        `Version mismatch: resource has been modified by another request. Expected version ${expectedVersion}, but found ${actualVersion}. Please refresh and retry.`,
        resourceType,
        resourceId,
        expectedVersion,
        actualVersion
      );
    }
  }

  /**
   * Execute UPDATE with optimistic locking enforcement
   *
   * This is a defensive wrapper that ensures version checking is ALWAYS
   * performed for UPDATE operations. Use this for all future write operations.
   *
   * @param updateFn - Async function that performs the update
   * @returns Promise<T> - Result from update function
   *
   * @example
   * ```typescript
   * await lpCalculator.updateWithVersionCheck(async () => {
   *   const [updated] = await db.update(lpReports)
   *     .set({
   *       status: 'ready',
   *       fileUrl: url,
   *       version: sql`${lpReports.version} + 1`
   *     })
   *     .where(and(
   *       eq(lpReports.id, reportId),
   *       eq(lpReports.version, expectedVersion) // VERSION CHECK
   *     ))
   *     .returning();
   *
   *   if (!updated) {
   *     throw new OptimisticLockError(...);
   *   }
   *   return updated;
   * });
   * ```
   */
  async updateWithVersionCheck<T>(updateFn: () => Promise<T>): Promise<T> {
    try {
      return await updateFn();
    } catch (error) {
      // If UPDATE returned 0 rows, version mismatch occurred
      if (error instanceof OptimisticLockError) {
        throw error;
      }
      throw error;
    }
  }
}

// Export singleton instance
export const lpCalculator = new LPCalculator();
