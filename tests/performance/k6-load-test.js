import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pageLoadTime = new Trend('page_load_time');
const apiResponseTime = new Trend('api_response_time');

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 15 },  // Ramp up to 15 users
    { duration: '2m', target: 15 },   // Stay at 15 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests under 3s
    http_req_failed: ['rate<0.05'],    // Error rate under 5%
    errors: ['rate<0.1'],               // Custom error rate under 10%
    page_load_time: ['p(95)<5000'],    // Page loads under 5s for 95%
    api_response_time: ['p(95)<1000'], // API responses under 1s for 95%
  },
};

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const PROD_URL = __ENV.PROD_URL || 'https://updog-restore.vercel.app';
const TEST_URL = __ENV.TEST_ENVIRONMENT === 'production' ? PROD_URL : BASE_URL;

export default function() {
  group('Homepage Load Test', () => {
    const startTime = Date.now();
    const response = http.get(TEST_URL);
    const loadTime = Date.now() - startTime;
    
    pageLoadTime.add(loadTime);
    
    const isSuccess = check(response, {
      'homepage loads successfully': (r) => r.status === 200,
      'homepage contains title': (r) => r.body.includes('<title>'),
      'homepage loads within 5s': () => loadTime < 5000,
      'homepage has no server errors': (r) => !r.body.includes('Internal Server Error'),
    });
    
    errorRate.add(!isSuccess);
  });

  group('Dashboard Load Test', () => {
    const startTime = Date.now();
    const response = http.get(`${TEST_URL}/dashboard`);
    const loadTime = Date.now() - startTime;
    
    pageLoadTime.add(loadTime);
    
    const isSuccess = check(response, {
      'dashboard accessible': (r) => r.status === 200 || r.status === 302, // 302 for redirects
      'dashboard loads within 3s': () => loadTime < 3000,
      'dashboard has content': (r) => r.body.length > 1000,
    });
    
    errorRate.add(!isSuccess);
  });

  group('Portfolio Load Test', () => {
    const startTime = Date.now();
    const response = http.get(`${TEST_URL}/portfolio`);
    const loadTime = Date.now() - startTime;
    
    pageLoadTime.add(loadTime);
    
    check(response, {
      'portfolio page accessible': (r) => r.status === 200 || r.status === 302,
      'portfolio loads within 4s': () => loadTime < 4000,
    });
  });

  group('API Health Check', () => {
    const healthEndpoints = ['/healthz', '/api/health', '/api/status'];
    
    for (const endpoint of healthEndpoints) {
      const startTime = Date.now();
      const response = http.get(`${TEST_URL}${endpoint}`);
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        apiResponseTime.add(responseTime);
        
        check(response, {
          'health endpoint responds quickly': () => responseTime < 1000,
          'health endpoint returns valid JSON': (r) => {
            try {
              JSON.parse(r.body);
              return true;
            } catch {
              return false;
            }
          },
        });
        break; // Only test the first working endpoint
      }
    }
  });

  group('Static Assets Load Test', () => {
    // Test loading of common static assets
    const assetPaths = [
      '/favicon.ico',
      '/assets/index.js', // Common build output name
      '/assets/index.css',
    ];
    
    for (const assetPath of assetPaths) {
      const startTime = Date.now();
      const response = http.get(`${TEST_URL}${assetPath}`);
      const loadTime = Date.now() - startTime;
      
      if (response.status === 200) {
        check(response, {
          'static asset loads quickly': () => loadTime < 2000,
          'static asset has content': (r) => r.body.length > 0,
        });
      }
    }
  });

  // Simulate user behavior
  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}

export function handleSummary(data) {
  console.log('Load test completed');
  console.log(`Total requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`Average response time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`95th percentile response time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`Error rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  
  return {
    'test-results/k6-summary.json': JSON.stringify(data, null, 2),
    'test-results/k6-summary.html': generateHTMLReport(data),
  };
}

function generateHTMLReport(data) {
  const metrics = data.metrics;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Load Test Results</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .metric { margin: 10px 0; padding: 10px; border-left: 4px solid #007acc; }
            .pass { border-color: #28a745; }
            .fail { border-color: #dc3545; }
            .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>Load Test Results</h1>
        <div class="summary">
            <h2>Summary</h2>
            <p><strong>Test Duration:</strong> ${data.state.testRunDurationMs}ms</p>
            <p><strong>Total Requests:</strong> ${metrics.http_reqs.values.count}</p>
            <p><strong>Average Response Time:</strong> ${metrics.http_req_duration.values.avg.toFixed(2)}ms</p>
            <p><strong>95th Percentile:</strong> ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms</p>
            <p><strong>Error Rate:</strong> ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%</p>
        </div>
        
        <h2>Detailed Metrics</h2>
        <div class="metric ${metrics.http_req_duration.values['p(95)'] < 3000 ? 'pass' : 'fail'}">
            <strong>Response Time (95th percentile):</strong> ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
            <small>Threshold: < 3000ms</small>
        </div>
        
        <div class="metric ${metrics.http_req_failed.values.rate < 0.05 ? 'pass' : 'fail'}">
            <strong>Error Rate:</strong> ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%
            <small>Threshold: < 5%</small>
        </div>
        
        <p><em>Generated at: ${new Date().toISOString()}</em></p>
    </body>
    </html>
  `;
}