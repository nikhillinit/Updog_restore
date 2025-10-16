import type { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';

// Create dedicated registry for RUM v2 metrics
const rumV2Registry = new client.Registry();

// ===== RUM v2 Telemetry Counters =====

// Ingestion counters with detailed labels
export const rumIngestTotal = new client.Counter({
  name: 'rum_ingest_total',
  help: 'Total RUM beacons accepted',
  labelNames: ['metric_type', 'device', 'connection'],
  registers: [rumV2Registry],
});

export const rumIngestRejectedTotal = new client.Counter({
  name: 'rum_ingest_rejected_total',
  help: 'Total RUM beacons rejected by reason',
  labelNames: ['reason'],
  registers: [rumV2Registry],
});

// Cardinality tracking
export const rumUniqueRoutesToday = new client.Gauge({
  name: 'rum_unique_routes_today',
  help: 'Unique routes tracked today (cardinality budget)',
  registers: [rumV2Registry],
});

// Label budget tracking
export const rumLabelBudgetUsed = new client.Gauge({
  name: 'rum_label_budget_used',
  help: 'Percentage of label budget consumed',
  labelNames: ['dimension'],
  registers: [rumV2Registry],
});

// Circuit breaker for RUM ingestion
export const rumCircuitBreakerState = new client.Gauge({
  name: 'rum_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  registers: [rumV2Registry],
});

// ===== Replay Window Tracking =====

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SOFT_REPLAY_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function validateReplayWindow(timestamp: number): { valid: boolean; reason?: string } {
  const now = Date.now();
  const age = now - timestamp;
  
  if (age < 0) {
    return { valid: false, reason: 'future_timestamp' };
  }
  
  if (age > SOFT_REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'stale' };
  }
  
  if (age > REPLAY_WINDOW_MS) {
    return { valid: false, reason: 'stale_soft' };
  }
  
  return { valid: true };
}

// ===== Origin Validation =====

export function validateOrigin(origin: string | undefined, referer: string | undefined): boolean {
  if (!origin || !referer) return false;

  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean); // avoid [''] when env is unset
  if (allowedOrigins.length === 0) {
    // Default to public URL
    allowedOrigins.push(process.env['PUBLIC_URL'] || 'http://localhost:5173');
  }
  
  return allowedOrigins.some(allowed => 
    origin === allowed || referer.startsWith(allowed)
  );
}

// ===== Cardinality Guard =====

const routeCardinality = new Map<string, Set<string>>();
const MAX_ROUTES_PER_DAY = parseInt(process.env['RUM_MAX_ROUTES'] || '1000');
const MAX_LABELS_PER_ROUTE = parseInt(process.env['RUM_MAX_LABELS'] || '50');

// Reset daily at midnight
setInterval(() => {
  const hour = new Date().getHours();
  if (hour === 0) {
    routeCardinality.clear();
    rumUniqueRoutesToday['set'](0);
  }
}, 60 * 60 * 1000); // Check every hour

export function checkCardinality(pathname: string, labels: Record<string, string>): boolean {
  // Get or create route entry
  if (!routeCardinality.has(pathname)) {
    if (routeCardinality.size >= MAX_ROUTES_PER_DAY) {
      return false; // Exceeded daily route limit
    }
    routeCardinality['set'](pathname, new Set());
  }
  
  const routeLabels = routeCardinality['get'](pathname)!;
  const labelKey = JSON.stringify(labels);
  
  if (!routeLabels.has(labelKey)) {
    if (routeLabels.size >= MAX_LABELS_PER_ROUTE) {
      return false; // Exceeded labels per route
    }
    routeLabels.add(labelKey);
  }
  
  // Update gauge
  rumUniqueRoutesToday['set'](routeCardinality.size);
  
  // Calculate and update label budget
  const totalLabels = Array.from(routeCardinality.values()).reduce((sum: any, set: any) => sum + set.size, 0);
  const maxTotalLabels = MAX_ROUTES_PER_DAY * MAX_LABELS_PER_ROUTE;
  const budgetUsed = (totalLabels / maxTotalLabels) * 100;
  
  rumLabelBudgetUsed.labels({ dimension: 'total' })['set'](budgetUsed);
  rumLabelBudgetUsed.labels({ dimension: 'routes' })['set']((routeCardinality.size / MAX_ROUTES_PER_DAY) * 100);
  
  return true;
}

// ===== Enhanced RUM v2 Middleware =====

export function rumV2Enhancement(req: Request, res: Response, next: NextFunction) {
  // Skip if not enabled
  if (process.env['ENABLE_RUM_V2'] !== '1') {
    return next();
  }
  
  // Attach v2 processing to request
  (req as any).rumV2 = {
    processMetric: (name: string, value: number, labels: Record<string, any>) => {
      const { pathname = '/', rating = 'unknown', navigationType = 'navigate' } = labels;
      const timestamp = labels["timestamp"] || Date.now();
      
      // 1. Validate replay window
      const replayValidation = validateReplayWindow(timestamp);
      if (!replayValidation.valid) {
        rumIngestRejectedTotal.labels({ reason: replayValidation.reason! }).inc();
        return false;
      }
      
      // 2. Validate origin
      const origin = req['get']('origin');
      const referer = req['get']('referer');
      if (!validateOrigin(origin, referer)) {
        rumIngestRejectedTotal.labels({ reason: 'origin' }).inc();
        return false;
      }
      
      // 3. Check cardinality budget
      const sanitizedPath = pathname.split('?')[0].replace(/\/[a-f0-9-]{36}/gi, '/:id');
      if (!checkCardinality(sanitizedPath, { rating, navigationType })) {
        rumIngestRejectedTotal.labels({ reason: 'label_budget' }).inc();
        return false;
      }
      
      // 4. Detect device type and connection
      const userAgent = req['get']('user-agent') || '';
      const device = /mobile/i.test(userAgent) ? 'mobile' : 'desktop';
      const connection = req['get']('downlink') || 'unknown';
      
      // 5. Record accepted metric
      rumIngestTotal.labels({ 
        metric_type: name.toUpperCase(),
        device,
        connection
      }).inc();
      
      return true;
    },
    
    getMetrics: async () => {
      return rumV2Registry.metrics();
    }
  };
  
  next();
}

// ===== Circuit Breaker Implementation =====

class RUMCircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly threshold = 10;
  private readonly timeout = 60000; // 1 minute
  private readonly successThreshold = 5;
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successes = 0;
      } else {
        rumCircuitBreakerState['set'](1);
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        rumCircuitBreakerState['set'](0);
      } else {
        rumCircuitBreakerState['set'](2);
      }
    } else {
      rumCircuitBreakerState['set'](0);
    }
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
      rumCircuitBreakerState['set'](1);
    }
  }
  
  getState() {
    return this.state;
  }
}

export const rumCircuitBreaker = new RUMCircuitBreaker();

// Export registry for metrics endpoint
export { rumV2Registry };