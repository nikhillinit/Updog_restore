import { db } from '../server/db';
import { funds, fundConfigs } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getNestedRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = record[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function extractFundSizeFromConfig(config: unknown): number | null {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const record = config as Record<string, unknown>;
  return (
    parseNumeric(record['fundSize']) ??
    parseNumeric(getNestedRecord(record, 'generalInfo')?.['fundSize']) ??
    parseNumeric(getNestedRecord(record, 'fundFinancials')?.['fundSize']) ??
    null
  );
}

export async function resolvePacingFundSize(args: {
  fundId: number;
  configId?: number;
  configVersion?: number;
}): Promise<number> {
  let configRow = null;

  if (args.configId != null) {
    configRow = await db.query.fundConfigs.findFirst({
      where: eq(fundConfigs.id, args.configId),
    });
  }

  if (!configRow && args.configVersion != null) {
    configRow = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, args.fundId), eq(fundConfigs.version, args.configVersion)),
    });
  }

  if (!configRow) {
    configRow = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, args.fundId), eq(fundConfigs.isPublished, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    });
  }

  const configuredSize = extractFundSizeFromConfig(configRow?.config);
  if (configuredSize != null) {
    return configuredSize;
  }

  const fund = await db.query.funds.findFirst({
    where: eq(funds.id, args.fundId),
  });

  if (!fund) {
    throw new Error(`Fund ${args.fundId} not found`);
  }

  const persistedSize = Number(fund.size);
  if (!Number.isFinite(persistedSize)) {
    throw new Error(`Fund ${args.fundId} has invalid size`);
  }

  return persistedSize;
}
