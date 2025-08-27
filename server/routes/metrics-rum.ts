import { Router, Request, Response } from 'express';
import * as express from 'express';
import * as client from 'prom-client';

// Create dedicated registry for RUM metrics
const rumRegistry = new client.Registry();

// Web Vitals histograms
const webVitalsLCP = new client.Histogram({
  name: 'web_vitals_lcp',
  help: 'Largest Contentful Paint in milliseconds',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [1000, 2000, 2500, 3000, 4000, 5000, 10000], // LCP thresholds
  registers: [rumRegistry],
});

const webVitalsINP = new client.Histogram({
  name: 'web_vitals_inp',
  help: 'Interaction to Next Paint in milliseconds',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000], // INP thresholds
  registers: [rumRegistry],
});

const webVitalsCLS = new client.Histogram({
  name: 'web_vitals_cls',
  help: 'Cumulative Layout Shift score',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1], // CLS thresholds
  registers: [rumRegistry],
});

const webVitalsFCP = new client.Histogram({
  name: 'web_vitals_fcp',
  help: 'First Contentful Paint in milliseconds',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [500, 1000, 1800, 2000, 3000, 4000, 5000],
  registers: [rumRegistry],
});

const webVitalsTTFB = new client.Histogram({
  name: 'web_vitals_ttfb',
  help: 'Time to First Byte in milliseconds',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [100, 200, 300, 500, 800, 1000, 2000],
  registers: [rumRegistry],
});

const webVitalsTTI = new client.Histogram({
  name: 'web_vitals_tti',
  help: 'Time to Interactive in milliseconds',
  labelNames: ['pathname', 'rating', 'navigationType'],
  buckets: [1000, 2000, 3800, 5000, 7300, 10000],
  registers: [rumRegistry],
});

// Counter for total metrics received
const rumMetricsReceived = new client.Counter({
  name: 'rum_metrics_received_total',
  help: 'Total number of RUM metrics received',
  labelNames: ['metric_name'],
  registers: [rumRegistry],
});

// Helper to select the right histogram
function getHistogram(name: string): client.Histogram | null {
  switch (name.toUpperCase()) {
    case 'LCP': return webVitalsLCP;
    case 'INP': return webVitalsINP;
    case 'CLS': return webVitalsCLS;
    case 'FCP': return webVitalsFCP;
    case 'TTFB': return webVitalsTTFB;
    case 'TTI': return webVitalsTTI;
    default: return null;
  }
}

export const metricsRumRouter = Router();

// Import guards
import { rumPrivacyGuard } from './metrics-rum.guard.js';
import { rumV2Enhancement, rumCircuitBreaker } from './metrics-rum-v2.js';

// Apply privacy guard to all RUM routes
metricsRumRouter.use(rumPrivacyGuard);

// Apply v2 enhancements if enabled
metricsRumRouter.use(rumV2Enhancement);

// Accept RUM metrics from browser
metricsRumRouter.post('/metrics/rum', express.json({ limit: '10kb' }), async (req: Request, res: Response) => {
  try {
    const { name, value, rating, navigationType, pathname, timestamp } = req.body || {};
    
    // Validate required fields
    if (!name || typeof value !== 'number') {
      return res.status(400).json({ error: 'Invalid metric data' });
    }
    
    // If RUM v2 is enabled, use enhanced processing
    if (process.env.ENABLE_RUM_V2 === '1' && (req as any).rumV2) {
      try {
        const processed = await rumCircuitBreaker.execute(async () => {
          return (req as any).rumV2.processMetric(name, value, {
            pathname,
            rating,
            navigationType,
            timestamp: timestamp || Date.now()
          });
        });
        
        if (!processed) {
          // Metric was rejected by v2 validation
          return res.status(204).end();
        }
      } catch (circuitError) {
        console.error('[RUM v2] Circuit breaker triggered:', circuitError);
        // Fall through to legacy processing
      }
    }
    
    // Sanitize pathname to prevent cardinality explosion
    const sanitizedPath = pathname ? pathname.split('?')[0].replace(/\/[a-f0-9-]{36}/gi, '/:id') : '/';
    
    // Get the appropriate histogram
    const histogram = getHistogram(name);
    if (histogram) {
      histogram.labels({
        pathname: sanitizedPath,
        rating: rating || 'unknown',
        navigationType: navigationType || 'navigate',
      }).observe(value);
      
      // Increment counter
      rumMetricsReceived.labels({ metric_name: name.toUpperCase() }).inc();
      
      // Log in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[RUM] ${name}: ${value}ms (${rating}) - ${sanitizedPath}`);
      }
    }
    
    // Always return 204 No Content for beacon requests
    res.status(204).end();
  } catch (error) {
    console.error('Error processing RUM metric:', error);
    // Still return 204 to prevent beacon retries
    res.status(204).end();
  }
});

// Expose RUM metrics separately from main metrics
metricsRumRouter.get('/metrics/rum', (req: Request, res: Response) => {
  res.set('Content-Type', rumRegistry.contentType);
  rumRegistry.metrics().then(metrics => {
    res.end(metrics);
  }).catch(err => {
    res.status(500).json({ error: 'Failed to generate metrics', message: err.message });
  });
});

// Counter for synthetic beacon tracking
const syntheticBeaconCounter = new client.Counter({
  name: 'rum_synthetic_beacons_total',
  help: 'Total synthetic beacons received for health monitoring',
  labelNames: ['source'],
  registers: [rumRegistry],
});

// Health check for RUM endpoint
metricsRumRouter.get('/metrics/rum/health', async (req: Request, res: Response) => {
  // Track synthetic health check
  const source = req.get('X-Synthetic-Source') || 'health-check';
  syntheticBeaconCounter.labels({ source }).inc();
  
  // Get metrics as string and parse to count total
  const metricsText = await rumRegistry.metrics();
  const totalMatch = metricsText.match(/rum_metrics_received_total\{[^}]*\}\s+(\d+)/g);
  let totalReceived = 0;
  if (totalMatch) {
    totalMatch.forEach(match => {
      const value = parseInt(match.split(' ').pop() || '0');
      totalReceived += value;
    });
  }
  
  // Get synthetic beacon count
  const syntheticCount = await syntheticBeaconCounter.get();
  const syntheticTotal = syntheticCount.values.reduce((sum, v) => sum + (v.value || 0), 0);
  
  res.json({
    status: 'healthy',
    metrics_received: totalReceived,
    synthetic_beacons: syntheticTotal,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Export registry for aggregation with main metrics if needed
export { rumRegistry };