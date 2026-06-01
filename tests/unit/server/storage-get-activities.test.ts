import { describe, expect, it } from 'vitest';
import { MemStorage } from '../../../server/storage';

describe('MemStorage.getActivities fund-scope overload', () => {
  it('returns all seeded activities when no fundId is provided', async () => {
    const storage = new MemStorage();
    const all = await storage.getActivities();
    expect(all.length).toBeGreaterThan(0);
  });

  it('filters by a single fundId', async () => {
    const storage = new MemStorage();
    const fund1 = await storage.getActivities(1);
    expect(fund1.length).toBeGreaterThan(0);
    expect(fund1.every((a) => a.fundId === 1)).toBe(true);
    expect(await storage.getActivities(999)).toHaveLength(0);
  });

  it('filters by an array of fundIds (inArray-equivalent)', async () => {
    const storage = new MemStorage();
    const some = await storage.getActivities([1, 999]);
    const single = await storage.getActivities(1);
    expect(some.every((a) => a.fundId === 1)).toBe(true);
    expect(some.length).toBe(single.length);
  });

  it('returns [] for an empty fundId array without leaking all funds', async () => {
    const storage = new MemStorage();
    const empty = await storage.getActivities([]);
    const all = await storage.getActivities();
    expect(empty).toEqual([]);
    expect(empty.length).not.toBe(all.length);
  });
});
