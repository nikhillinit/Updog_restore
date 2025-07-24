// Observability hook for SlackBatchAPI metrics export
// Integrates with existing Prometheus/Grafana stack

import { register, Counter, Histogram } from 'prom-client';

// Prometheus metrics for SlackBatchAPI
const slackCacheHits = new Counter({
  name: 'slack_api_cache_hits_total',
  help: 'Total number of Slack API cache hits',
  labelNames: ['cache_type', 'api_method']
});

const slackBatchCount = new Counter({
  name: 'slack_api_batch_calls_total', 
  help: 'Total number of batched Slack API calls made',
  labelNames: ['api_method', 'batch_size']
});

const slackRateLimitRetries = new Counter({
  name: 'slack_api_rate_limit_retries_total',
  help: 'Total number of Slack API rate limit retries',
  labelNames: ['api_method', 'retry_count']
});

// Response time histogram
const slackApiDuration = new Histogram({
  name: 'slack_api_request_duration_seconds',
  help: 'Slack API request duration in seconds',
  labelNames: ['api_method', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Export function to be called from SlackBatchAPI
export function recordSlackMetrics(metrics, method = 'batch') {
  // Cache metrics
  slackCacheHits.inc({ 
    cache_type: metrics.cacheType || 'memory', 
    api_method: method 
  }, metrics.cacheHits || 0);
  
  // Batch metrics  
  slackBatchCount.inc({
    api_method: method,
    batch_size: metrics.batchSize || 50
  }, metrics.apiCalls || 0);
  
  // Rate limit retries
  if (metrics.rateLimitRetries > 0) {
    slackRateLimitRetries.inc({
      api_method: method,
      retry_count: metrics.rateLimitRetries
    }, metrics.rateLimitRetries);
  }
  
  // Response time
  if (metrics.avgResponseTime) {
    slackApiDuration.observe({
      api_method: method,
      status: 'success'
    }, metrics.avgResponseTime / 1000); // Convert to seconds
  }
}

// Integration with perf-log workflow
export function exportToPerformanceLog(metrics, method = 'slack_batch') {
  const timestamp = new Date().toISOString();
  const logEntry = `
## Slack Batch API Performance - ${timestamp}

- **Method**: ${method}
- **Cache Hit Rate**: ${metrics.cacheHitRate}
- **API Calls Made**: ${metrics.apiCalls}
- **Batches Saved**: ${metrics.batchesSaved}
- **Rate Limit Retries**: ${metrics.rateLimitRetries || 0}
- **Avg Response Time**: ${metrics.avgResponseTime || 'N/A'}ms

**Efficiency**: ${((metrics.batchesSaved / (metrics.batchesSaved + metrics.apiCalls)) * 100).toFixed(1)}% reduction in API calls

---
`;
  
  return logEntry;
}
