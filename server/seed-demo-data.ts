import { db } from './db';
import { reserveStrategies, pacingHistory } from '@schema';
import { logger } from './lib/logger';

type ReserveStrategyInsert = typeof reserveStrategies.$inferInsert;
type PacingHistoryInsert = typeof pacingHistory.$inferInsert;

export async function seedDemoData() {
  logger.info('Seeding demo data');

  // Insert reserve strategies
  const reserveStrategyRows: ReserveStrategyInsert[] = [
    {
      fundId: 1,
      companyId: 1,
      allocation: '500000.00',
      confidence: '0.75',
    },
    {
      fundId: 1,
      companyId: 2,
      allocation: '750000.00',
      confidence: '0.85',
    },
  ];
  await db.insert(reserveStrategies).values(reserveStrategyRows);

  // Insert pacing history
  const pacingHistoryRows: PacingHistoryInsert[] = [
    {
      fundId: 1,
      quarter: '2025Q3',
      deploymentAmount: '2000000.00',
      marketCondition: 'bull',
    },
    {
      fundId: 1,
      quarter: '2025Q4',
      deploymentAmount: '1500000.00',
      marketCondition: 'neutral',
    },
  ];
  await db.insert(pacingHistory).values(pacingHistoryRows);

  logger.info('Demo data seeded successfully');
}

if (require.main === module) {
  seedDemoData().catch((error: unknown) => {
    logger.error({ error }, 'Demo data seed failed');
  });
}
