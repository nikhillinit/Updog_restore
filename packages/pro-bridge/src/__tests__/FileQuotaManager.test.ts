import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileQuotaManager } from '../FileQuotaManager';
import type { QuotaConfig } from '../types';

describe('FileQuotaManager', () => {
  let tempDir: string;
  let manager: FileQuotaManager;
  const testConfig: QuotaConfig = {
    id: 'deep-think',
    limit: 50,
    periodMs: 24 * 60 * 60 * 1000, // 24 hours
    description: 'Deep Think quota',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-test-'));
    manager = new FileQuotaManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getStatus', () => {
    it('returns full quota for new config', async () => {
      const status = await manager.getStatus(testConfig);

      expect(status.used).toBe(0);
      expect(status.remaining).toBe(50);
      expect(status.isExhausted).toBe(false);
      expect(status.config).toEqual(testConfig);
    });

    it('reflects used quota', async () => {
      await manager.increment(testConfig);
      await manager.increment(testConfig);

      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(2);
      expect(status.remaining).toBe(48);
    });

    it('resets quota after period expires', async () => {
      // Use past timestamp
      const oldData = {
        used: 45,
        lastReset: Date.now() - testConfig.periodMs - 1000,
      };
      const filePath = path.join(tempDir, `quota-${testConfig.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(oldData));

      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(0);
      expect(status.remaining).toBe(50);
    });
  });

  describe('increment', () => {
    it('increments used count by 1', async () => {
      await manager.increment(testConfig);
      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(1);
    });

    it('increments by custom amount', async () => {
      await manager.increment(testConfig, 5);
      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(5);
    });

    it('returns false when quota exhausted', async () => {
      // Fill up quota
      const filePath = path.join(tempDir, `quota-${testConfig.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        used: 50,
        lastReset: Date.now(),
      }));

      const result = await manager.increment(testConfig);
      expect(result).toBe(false);
    });

    it('succeeds when quota available', async () => {
      const result = await manager.increment(testConfig);
      expect(result).toBe(true);
    });
  });

  describe('tryReserve', () => {
    it('creates a reservation when quota available', async () => {
      const reservation = await manager.tryReserve(testConfig);

      expect(reservation).not.toBeNull();
      expect(reservation?.quotaId).toBe('deep-think');
      expect(reservation?.amount).toBe(1);
    });

    it('returns null when quota exhausted', async () => {
      const filePath = path.join(tempDir, `quota-${testConfig.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        used: 50,
        lastReset: Date.now(),
      }));

      const reservation = await manager.tryReserve(testConfig);
      expect(reservation).toBeNull();
    });

    it('reserves multiple when amount specified', async () => {
      const reservation = await manager.tryReserve(testConfig, 5);
      expect(reservation?.amount).toBe(5);

      const status = await manager.getStatus(testConfig);
      expect(status.remaining).toBe(45);
    });

    it('fails when requested amount exceeds remaining', async () => {
      const filePath = path.join(tempDir, `quota-${testConfig.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        used: 48,
        lastReset: Date.now(),
      }));

      const reservation = await manager.tryReserve(testConfig, 5);
      expect(reservation).toBeNull();
    });
  });

  describe('commit', () => {
    it('commits a reservation (no change to used count)', async () => {
      const reservation = await manager.tryReserve(testConfig);
      expect(reservation).not.toBeNull();

      await manager.commit(testConfig, reservation!);

      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(1); // Reserved amount stays committed
    });

    it('handles double commit gracefully', async () => {
      const reservation = await manager.tryReserve(testConfig);

      await manager.commit(testConfig, reservation!);
      await manager.commit(testConfig, reservation!); // Should not throw

      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(1); // Still just 1
    });
  });

  describe('release', () => {
    it('releases a reservation back to available quota', async () => {
      const reservation = await manager.tryReserve(testConfig);
      expect(reservation).not.toBeNull();

      const statusBefore = await manager.getStatus(testConfig);
      expect(statusBefore.remaining).toBe(49);

      await manager.release(testConfig, reservation!);

      const statusAfter = await manager.getStatus(testConfig);
      expect(statusAfter.remaining).toBe(50);
    });

    it('handles double release gracefully', async () => {
      const reservation = await manager.tryReserve(testConfig);

      await manager.release(testConfig, reservation!);
      await manager.release(testConfig, reservation!); // Should not throw

      const status = await manager.getStatus(testConfig);
      expect(status.remaining).toBe(50);
    });
  });

  describe('file locking', () => {
    it('handles concurrent reservations safely', async () => {
      // Create 10 concurrent reservation attempts
      const promises = Array.from({ length: 10 }, () =>
        manager.tryReserve(testConfig)
      );

      const results = await Promise.all(promises);
      const successfulReservations = results.filter(r => r !== null);

      // All should succeed since we have 50 quota
      expect(successfulReservations.length).toBe(10);

      const status = await manager.getStatus(testConfig);
      expect(status.used).toBe(10);
    });
  });
});
