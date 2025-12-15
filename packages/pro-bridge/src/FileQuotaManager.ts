import * as fs from 'fs';
import * as path from 'path';
import type { QuotaConfig, QuotaStatus, QuotaReservation } from './types';

/**
 * Internal quota data structure stored in JSON file
 */
interface QuotaData {
  used: number;
  lastReset: number;
  reservations: Record<string, QuotaReservation>;
}

/**
 * File-based quota manager with atomic operations
 *
 * Uses file-based storage for Windows compatibility (no Redis required).
 * Implements reserve/commit pattern to prevent quota overshoot on failures.
 */
export class FileQuotaManager {
  private readonly dataDir: string;
  private readonly lockTimeout = 5000; // 5 second lock timeout
  private readonly reservationTtl = 60000; // 1 minute reservation TTL

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  /**
   * Get current quota status for a config
   */
  async getStatus(config: QuotaConfig): Promise<QuotaStatus> {
    const data = await this.readQuotaData(config);
    const now = Date.now();

    // Check if period has expired and reset
    if (now - data.lastReset >= config.periodMs) {
      data.used = 0;
      data.lastReset = now;
      data.reservations = {};
      await this.writeQuotaData(config, data);
    }

    // Count active reservations
    const activeReservations = this.countActiveReservations(data.reservations);

    const used = data.used + activeReservations;
    const remaining = Math.max(0, config.limit - used);

    return {
      config,
      used,
      remaining,
      resetsAt: data.lastReset + config.periodMs,
      isExhausted: remaining === 0,
    };
  }

  /**
   * Increment quota usage (simple increment without reservation)
   * @returns true if increment succeeded, false if quota exhausted
   */
  async increment(config: QuotaConfig, amount = 1): Promise<boolean> {
    return this.withLock(config, async () => {
      const data = await this.readQuotaData(config);
      const now = Date.now();

      // Check if period has expired
      if (now - data.lastReset >= config.periodMs) {
        data.used = 0;
        data.lastReset = now;
        data.reservations = {};
      }

      // Clean up expired reservations
      this.cleanExpiredReservations(data.reservations);

      // Check available quota
      const activeReservations = this.countActiveReservations(data.reservations);
      const available = config.limit - data.used - activeReservations;

      if (available < amount) {
        return false;
      }

      data.used += amount;
      await this.writeQuotaData(config, data);
      return true;
    });
  }

  /**
   * Try to reserve quota for an operation
   * @returns Reservation if successful, null if quota exhausted
   */
  async tryReserve(config: QuotaConfig, amount = 1): Promise<QuotaReservation | null> {
    return this.withLock(config, async () => {
      const data = await this.readQuotaData(config);
      const now = Date.now();

      // Check if period has expired
      if (now - data.lastReset >= config.periodMs) {
        data.used = 0;
        data.lastReset = now;
        data.reservations = {};
      }

      // Clean up expired reservations
      this.cleanExpiredReservations(data.reservations);

      // Check available quota
      const activeReservations = this.countActiveReservations(data.reservations);
      const available = config.limit - data.used - activeReservations;

      if (available < amount) {
        return null;
      }

      // Create reservation
      const reservation: QuotaReservation = {
        id: this.generateReservationId(),
        quotaId: config.id,
        amount,
        createdAt: now,
        expiresAt: now + this.reservationTtl,
      };

      data.reservations[reservation.id] = reservation;
      await this.writeQuotaData(config, data);

      return reservation;
    });
  }

  /**
   * Commit a reservation (convert to permanent usage)
   */
  async commit(config: QuotaConfig, reservation: QuotaReservation): Promise<void> {
    return this.withLock(config, async () => {
      const data = await this.readQuotaData(config);

      // Check if reservation exists
      const existing = data.reservations[reservation.id];
      if (!existing) {
        // Already committed or released - idempotent
        return;
      }

      // Convert reservation to permanent usage
      data.used += existing.amount;
      delete data.reservations[reservation.id];

      await this.writeQuotaData(config, data);
    });
  }

  /**
   * Release a reservation (return quota to pool)
   */
  async release(config: QuotaConfig, reservation: QuotaReservation): Promise<void> {
    return this.withLock(config, async () => {
      const data = await this.readQuotaData(config);

      // Check if reservation exists
      if (!data.reservations[reservation.id]) {
        // Already released - idempotent
        return;
      }

      // Simply remove the reservation
      delete data.reservations[reservation.id];

      await this.writeQuotaData(config, data);
    });
  }

  /**
   * Get the file path for a quota config
   */
  private getFilePath(config: QuotaConfig): string {
    return path.join(this.dataDir, `quota-${config.id}.json`);
  }

  /**
   * Get the lock file path for a quota config
   */
  private getLockPath(config: QuotaConfig): string {
    return path.join(this.dataDir, `quota-${config.id}.lock`);
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Read quota data from file
   */
  private async readQuotaData(config: QuotaConfig): Promise<QuotaData> {
    const filePath = this.getFilePath(config);

    if (!fs.existsSync(filePath)) {
      return {
        used: 0,
        lastReset: Date.now(),
        reservations: {},
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Partial<QuotaData>;
      return {
        used: data.used ?? 0,
        lastReset: data.lastReset ?? Date.now(),
        reservations: data.reservations ?? {},
      };
    } catch {
      // Corrupted file - reset
      return {
        used: 0,
        lastReset: Date.now(),
        reservations: {},
      };
    }
  }

  /**
   * Write quota data to file atomically
   */
  private async writeQuotaData(config: QuotaConfig, data: QuotaData): Promise<void> {
    const filePath = this.getFilePath(config);
    const tempPath = `${filePath}.tmp`;

    // Write to temp file first
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));

    // Atomic rename
    fs.renameSync(tempPath, filePath);
  }

  /**
   * Execute operation with file lock
   */
  private async withLock<T>(config: QuotaConfig, operation: () => Promise<T>): Promise<T> {
    const lockPath = this.getLockPath(config);
    const startTime = Date.now();

    // Acquire lock
    while (true) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
        break;
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EEXIST') {
          // Lock exists - check if stale
          try {
            const lockContent = fs.readFileSync(lockPath, 'utf-8');
            const lockPid = parseInt(lockContent, 10);
            const lockStat = fs.statSync(lockPath);
            const lockAge = Date.now() - lockStat.mtimeMs;

            // Stale if older than timeout or process doesn't exist
            if (lockAge > this.lockTimeout || !this.isProcessRunning(lockPid)) {
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch {
            // Lock file disappeared - retry
            continue;
          }

          // Check timeout
          if (Date.now() - startTime > this.lockTimeout) {
            throw new Error(`Failed to acquire lock for quota ${config.id}`);
          }

          // Wait and retry
          await this.sleep(50);
          continue;
        }
        throw error;
      }
    }

    try {
      return await operation();
    } finally {
      // Release lock
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Lock already released
      }
    }
  }

  /**
   * Check if a process is running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired reservations
   */
  private cleanExpiredReservations(reservations: Record<string, QuotaReservation>): void {
    const now = Date.now();
    for (const [id, reservation] of Object.entries(reservations)) {
      if (reservation.expiresAt < now) {
        delete reservations[id];
      }
    }
  }

  /**
   * Count active (non-expired) reservations
   */
  private countActiveReservations(reservations: Record<string, QuotaReservation>): number {
    const now = Date.now();
    let count = 0;
    for (const reservation of Object.values(reservations)) {
      if (reservation.expiresAt >= now) {
        count += reservation.amount;
      }
    }
    return count;
  }

  /**
   * Generate unique reservation ID
   */
  private generateReservationId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
