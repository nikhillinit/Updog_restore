/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { db } from './db';
import { reserveStrategies, pacingHistory } from '@schema';

export async function seedDemoData() {
  console.log('Seeding demo data...');

  // Insert reserve strategies
  await db.insert(reserveStrategies).values([
    {
      fundId: 1,
      companyId: 1,
      allocation: '500000.00',
      confidence: '0.75'
    },
    {
      fundId: 1,
      companyId: 2,
      allocation: '750000.00',
      confidence: '0.85'
    }
  ] as any);

  // Insert pacing history  
  await db.insert(pacingHistory).values([
    {
      fundId: 1,
      quarter: '2025Q3',
      deploymentAmount: '2000000.00',
      marketCondition: 'bull'
    },
    {
      fundId: 1,
      quarter: '2025Q4',
      deploymentAmount: '1500000.00',
      marketCondition: 'neutral'
    }
  ] as any);

  console.log('Demo data seeded successfully!');
}

if (require.main === module) {
  seedDemoData().catch(console.error);
}
