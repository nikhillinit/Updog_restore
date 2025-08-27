/**
 * Cardinality Guard for RUM Metrics
 * Prevents label explosion in Prometheus by enforcing daily budgets
 * Day 2: Production-grade cardinality control
 */

import { LRUCache } from 'lru-cache';

// Configuration via environment variables
const MAX_NEW_ROUTES_PER_DAY = Number(process.env.RUM_LABEL_BUDGET || 200);
const MAX_NEW_USERS_PER_DAY = Number(process.env.RUM_USER_BUDGET || 5000);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Label budget tracker with LRU eviction
 * Tracks unique label values seen today
 */
class LabelBudgetTracker {
  private seen: LRUCache<string, boolean>;
  private newToday: number = 0;
  private currentDay: number;
  private readonly maxPerDay: number;
  private readonly labelType: string;

  constructor(labelType: string, maxPerDay: number) {
    this.labelType = labelType;
    this.maxPerDay = maxPerDay;
    this.currentDay = this.getCurrentDay();
    this.seen = new LRUCache<string, boolean>({
      max: maxPerDay * 2, // Allow some buffer
      ttl: CACHE_TTL_MS,
    });
  }

  private getCurrentDay(): number {
    return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  }

  private resetIfNewDay(): void {
    const today = this.getCurrentDay();
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.newToday = 0;
      this.seen.clear();
      console.log(`[RUM] Label budget reset for ${this.labelType}: day ${today}`);
    }
  }

  /**
   * Check if a label value is allowed under the budget
   * Returns true if seen before or under daily limit
   */
  public allow(value: string): boolean {
    this.resetIfNewDay();

    // Already seen today - always allow
    if (this.seen.has(value)) {
      return true;
    }

    // Check if we're at the daily limit
    if (this.newToday >= this.maxPerDay) {
      return false;
    }

    // New value under budget - track it
    this.seen.set(value, true);
    this.newToday++;
    
    // Log when approaching limit
    if (this.newToday === Math.floor(this.maxPerDay * 0.8)) {
      console.warn(
        `[RUM] Label budget warning for ${this.labelType}: ` +
        `${this.newToday}/${this.maxPerDay} (80% used)`
      );
    }
    
    return true;
  }

  /**
   * Get current budget statistics
   */
  public getStats() {
    return {
      type: this.labelType,
      used: this.newToday,
      limit: this.maxPerDay,
      percentage: Math.round((this.newToday / this.maxPerDay) * 100),
      uniqueValues: this.seen.size,
    };
  }
}

// Initialize trackers for different label dimensions
const trackers = {
  route: new LabelBudgetTracker('route', MAX_NEW_ROUTES_PER_DAY),
  cid: new LabelBudgetTracker('cid', MAX_NEW_USERS_PER_DAY),
};

/**
 * Check if a label value is allowed under cardinality budget
 * @param labelName - The label dimension (route, cid, etc.)
 * @param value - The label value to check
 * @returns true if allowed, false if over budget
 */
export function allowLabel(labelName: 'route' | 'cid', value: string): boolean {
  const tracker = trackers[labelName];
  if (!tracker) {
    console.error(`[RUM] Unknown label type: ${labelName}`);
    return false;
  }
  
  return tracker.allow(value);
}

/**
 * Get cardinality statistics for monitoring
 */
export function getCardinalityStats() {
  return Object.values(trackers).map(t => t.getStats());
}

/**
 * Emergency circuit breaker for cardinality explosion
 * Returns true if any dimension is critically over budget
 */
export function isCardinalityCritical(): boolean {
  return Object.values(trackers).some(t => {
    const stats = t.getStats();
    return stats.percentage >= 95;
  });
}

// Export for testing
export const _testing = {
  trackers,
  LabelBudgetTracker,
};