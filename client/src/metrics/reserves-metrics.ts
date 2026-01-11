/**
 * Metrics collection and audit logging for Reserves v1.1
 * Browser-compatible with graceful degradation
 */

import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';

interface MetricEvent {
  type: string;
  value: number | string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface AuditEntry {
  operation: string;
  input_hash: string;
  output_hash: string;
  duration_ms: number;
  warnings?: string[];
  timestamp: string;
  user_id?: string;
}

class ReservesMetrics {
  private events: MetricEvent[] = [];
  private beaconUrl: string | null = null;
  private batchTimer: number | null = null;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  
  constructor() {
    // Get beacon URL from environment or meta tag
    if (typeof window !== 'undefined') {
      const metaTag = document.querySelector('meta[name="metrics-beacon-url"]');
      this.beaconUrl = metaTag?.getAttribute('content') || null;
    }
  }
  
  // Timer utilities
  startTimer(operation: string): { end: () => void } {
    const startTime = performance.now();
    
    return {
      end: () => {
        const duration = performance.now() - startTime;
        this.recordDuration(operation, duration);
      }
    };
  }
  
  // Record metrics
  recordDuration(operation: string, durationMs: number): void {
    this.addEvent({
      type: 'duration',
      value: durationMs,
      metadata: { operation },
      timestamp: Date.now()
    });
  }
  
  recordCompanyCount(count: number): void {
    this.addEvent({
      type: 'company_count',
      value: count,
      timestamp: Date.now()
    });
  }
  
  recordCapPolicy(kind: string): void {
    this.addEvent({
      type: 'cap_policy',
      value: kind,
      timestamp: Date.now()
    });
  }
  
  recordWarning(message: string): void {
    this.addEvent({
      type: 'warning',
      value: message,
      timestamp: Date.now()
    });
  }
  
  recordDivergence(tsResult: unknown, wasmResult: unknown): void {
    const divergence = this.calculateDivergence(tsResult, wasmResult);

    this.addEvent({
      type: 'divergence',
      value: divergence,
      metadata: {
        ts_hash: this.hashLite(tsResult),
        wasm_hash: this.hashLite(wasmResult)
      },
      timestamp: Date.now()
    });
  }
  
  recordRecovery(strategy: string, success: boolean): void {
    this.addEvent({
      type: 'recovery',
      value: strategy,
      metadata: { success },
      timestamp: Date.now()
    });
  }
  
  recordPerformanceMetric(metric: string, value: number, unit?: string): void {
    this.addEvent({
      type: 'performance',
      value: value,
      metadata: { metric, unit },
      timestamp: Date.now()
    });
  }
  
  recordCacheHit(cacheKey: string): void {
    this.addEvent({
      type: 'cache_hit',
      value: cacheKey,
      timestamp: Date.now()
    });
  }
  
  recordCacheMiss(cacheKey: string): void {
    this.addEvent({
      type: 'cache_miss',
      value: cacheKey,
      timestamp: Date.now()
    });
  }
  
  recordBatchProcessing(size: number, duration: number): void {
    this.addEvent({
      type: 'batch_processing',
      value: size,
      metadata: { duration },
      timestamp: Date.now()
    });
  }
  
  recordRolloutStage(stage: string, percentage: number): void {
    this.addEvent({
      type: 'rollout_stage',
      value: stage,
      metadata: { percentage },
      timestamp: Date.now()
    });
  }
  
  recordRollback(reason: string, fromVersion: string, toVersion: string): void {
    this.addEvent({
      type: 'rollback',
      value: reason,
      metadata: { fromVersion, toVersion },
      timestamp: Date.now()
    });
  }
  
  recordError(error: string): void {
    this.addEvent({
      type: 'error',
      value: error,
      timestamp: Date.now()
    });
  }
  
  // Calculate divergence between results
  private calculateDivergence(a: unknown, b: unknown): number {
    const aData = a as Record<string, unknown> | null | undefined;
    const bData = b as Record<string, unknown> | null | undefined;

    if (!aData?.['data'] || !bData?.['data']) return 1.0;

    const aDataObj = aData['data'] as Record<string, unknown>;
    const bDataObj = bData['data'] as Record<string, unknown>;
    const allocationsA = (aDataObj['allocations'] || []) as Array<Record<string, number>>;
    const allocationsB = (bDataObj['allocations'] || []) as Array<Record<string, number>>;

    if (allocationsA.length !== allocationsB.length) {
      return Math.abs(allocationsA.length - allocationsB.length) / Math.max(allocationsA.length, allocationsB.length, 1);
    }

    let totalDiff = 0;
    let totalAmount = 0;

    allocationsA.forEach((alloc, i: number) => {
      const otherAlloc = allocationsB[i];
      if (otherAlloc) {
        totalDiff += Math.abs(alloc['planned_cents'] - otherAlloc['planned_cents']);
        totalAmount += alloc['planned_cents'];
      }
    });

    return totalAmount > 0 ? totalDiff / totalAmount : 0;
  }
  
  // Lightweight hash for comparison
  hashLite(obj: unknown): string {
    const objRecord = obj as Record<string, unknown>;
    const str = JSON.stringify(objRecord, Object.keys(objRecord).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  // Add event and schedule batch send
  private addEvent(event: MetricEvent): void {
    this.events.push(event);
    
    // Schedule batch send if not already scheduled
    if (!this.batchTimer && this.beaconUrl) {
      this.batchTimer = window.setTimeout(() => {
        this.sendBatch();
      }, this.BATCH_INTERVAL);
    }
  }
  
  // Send batch of events
  private sendBatch(): void {
    if (this.events.length === 0 || !this.beaconUrl) {
      this.batchTimer = null;
      return;
    }
    
    const batch = [...this.events];
    this.events = [];
    this.batchTimer = null;
    
    // Use sendBeacon for reliability
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const payload = JSON.stringify({ events: batch });
      navigator.sendBeacon(this.beaconUrl, payload);
    } else {
      // Fallback to fetch
      fetch(this.beaconUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true
      }).catch(() => {
        // Silently fail - metrics are best-effort
      });
    }
  }
  
  // Force send all pending events
  flush(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.sendBatch();
  }
}

// Audit logger
class ReservesAuditLog {
  private readonly STORAGE_KEY = 'reserves_audit_log';
  private readonly MAX_ENTRIES = 100;
  
  record(entry: {
    operation: string;
    input: unknown;
    output: unknown;
    config: unknown;
    duration_ms: number;
    warnings?: string[];
    user_id?: string;
  }): void {
    const userId = entry.user_id ?? this.getUserId();

    const auditEntry: AuditEntry = {
      operation: entry.operation,
      input_hash: this.hashLite(entry.input),
      output_hash: this.hashLite(entry.output),
      duration_ms: entry.duration_ms,
      timestamp: new Date().toISOString(),
      ...spreadIfDefined("warnings", entry.warnings),
      ...spreadIfDefined("user_id", userId)
    };
    
    // Store in localStorage for debugging (in production, send to server)
    if (typeof localStorage !== 'undefined') {
      try {
        const existing = this.getEntries();
        existing.push(auditEntry);
        
        // Keep only recent entries
        const trimmed = existing.slice(-this.MAX_ENTRIES);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
      } catch (e) {
        // Storage might be full or disabled
        console.debug('Failed to store audit entry', e);
      }
    }
    
    // Send to server if configured
    this.sendToServer(auditEntry);
  }
  
  getEntries(): AuditEntry[] {
    if (typeof localStorage === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  clear(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }
  
  private hashLite(obj: unknown): string {
    const objRecord = obj as Record<string, unknown>;
    const str = JSON.stringify(objRecord, Object.keys(objRecord).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  
  private getUserId(): string | undefined {
    // Try to get user ID from various sources
    if (typeof window !== 'undefined') {
      // Check meta tag
      const metaTag = document.querySelector('meta[name="user-id"]');
      if (metaTag) return metaTag.getAttribute('content') || undefined;
      
      // Check session storage
      const stored = sessionStorage.getItem('user_id');
      if (stored) return stored;
    }
    return undefined;
  }
  
  private sendToServer(entry: AuditEntry): void {
    const auditUrl = this.getAuditUrl();
    if (!auditUrl) return;
    
    // Best-effort send
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(auditUrl, JSON.stringify(entry));
    } else if (typeof fetch !== 'undefined') {
      fetch(auditUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true
      }).catch(() => {
        // Silently fail
      });
    }
  }
  
  private getAuditUrl(): string | null {
    if (typeof window !== 'undefined') {
      const metaTag = document.querySelector('meta[name="audit-log-url"]');
      return metaTag?.getAttribute('content') || null;
    }
    return null;
  }
}

// Export singleton instances
export const metrics = new ReservesMetrics();
export const auditLog = new ReservesAuditLog();

// Auto-flush metrics on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    metrics.flush();
  });
}