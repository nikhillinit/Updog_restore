/**
 * FundStateReadService
 *
 * DB-backed service that loads fund lifecycle data and feeds it through
 * the pure deriveReadState() function. This is the only production path
 * for building a FundStateReadV1 DTO.
 *
 * Uses `db` from `../db` directly (NOT server/storage.ts).
 *
 * @module server/services/fund-state-read-service
 */

import { db } from '../db';
import { funds, fundConfigs, calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, desc, isNull, max } from 'drizzle-orm';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import { deriveReadState } from './fund-state-derivation';
import type { DerivationInput } from './fund-state-derivation';

export class FundStateReadService {
  /**
   * Load lifecycle data for a fund and derive its two-axis state.
   * Returns null if the fund does not exist.
   */
  async getState(fundId: number): Promise<FundStateReadV1 | null> {
    // 1. Fund existence check + engineResults presence
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });

    if (!fund) return null;

    // 2. Draft config head
    const draftConfig = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
      orderBy: desc(fundConfigs.version),
    });

    // 3. Published config head
    const publishedConfig = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)),
    });

    // 4. Latest version (MAX)
    const [versionResult] = await db
      .select({ maxVersion: max(fundConfigs.version) })
      .from(fundConfigs)
      .where(eq(fundConfigs.fundId, fundId));
    const latestVersion = versionResult?.maxVersion ?? null;

    // 5. Latest calcRun for the published configVersion
    let latestRun: DerivationInput['latestRun'] = null;
    if (publishedConfig) {
      const run = await db.query.calcRuns.findFirst({
        where: and(
          eq(calcRuns.fundId, fundId),
          eq(calcRuns.configVersion, publishedConfig.version)
        ),
        orderBy: desc(calcRuns.requestedAt),
      });

      if (run) {
        latestRun = {
          id: run.id,
          configVersion: run.configVersion,
          correlationId: run.correlationId,
          dispatchState: run.dispatchState,
          lastError: run.lastError,
        };
      }
    }

    // 6. Snapshots for this fund (attributed + unattributed for legacy fallback)
    const snapshots = await db
      .select({
        type: fundSnapshots.type,
        configVersion: fundSnapshots.configVersion,
        snapshotTime: fundSnapshots.snapshotTime,
        createdAt: fundSnapshots.createdAt,
      })
      .from(fundSnapshots)
      .where(and(eq(fundSnapshots.fundId, fundId), isNull(fundSnapshots.scenarioSetId)));

    // 7. Build input and derive
    const input: DerivationInput = {
      fundId,
      draftConfig: draftConfig
        ? { version: draftConfig.version, updatedAt: draftConfig.updatedAt }
        : null,
      publishedConfig: publishedConfig
        ? {
            version: publishedConfig.version,
            publishedAt: publishedConfig.publishedAt,
            updatedAt: publishedConfig.updatedAt,
          }
        : null,
      latestVersion,
      latestRun,
      attributedSnapshots: snapshots,
      engineResultsPresent: fund.engineResults != null,
    };

    return deriveReadState(input);
  }
}

export const fundStateReadService = new FundStateReadService();
