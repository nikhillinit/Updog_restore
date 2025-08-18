# API Versioning Guide

This guide explains how to use API versioning, feature flags, and OpenAPI documentation in the Updog platform.

## Overview

The API versioning system provides:
- Multiple API versions with graceful deprecation
- Feature flags for gradual rollouts
- OpenAPI documentation with Swagger UI
- Automatic deprecation warnings
- Version-specific routing

## API Versions

### Current Versions

| Version | Status | Deprecation | Sunset | Notes |
|---------|--------|------------|--------|-------|
| v1 | Deprecated | 2025-06-01 | 2025-12-01 | Legacy API, migrate to v2 |
| v2 | Current | - | - | Recommended version |
| v3 | Beta | - | - | Experimental features |

## Specifying API Version

You can specify the API version in multiple ways (in order of precedence):

### 1. URL Path
```http
GET /api/v2/funds
```

### 2. Header (API-Version)
```http
GET /api/funds
API-Version: v2
```

### 3. Header (X-API-Version)
```http
GET /api/funds
X-API-Version: v2
```

### 4. Accept Header
```http
GET /api/funds
Accept: application/vnd.api+v2
```

### 5. Query Parameter
```http
GET /api/funds?api_version=v2
GET /api/funds?v=2
```

If no version is specified, v2 (current) is used by default.

## Deprecation Handling

### Deprecation Headers

When using deprecated API versions, the following headers are included:

```http
Deprecation: true
Deprecation-Date: 2025-06-01
Sunset: 2025-12-01
Link: </api/v2>; rel="successor-version"
Warning: 299 - "API version v1 is deprecated and will be removed on 2025-12-01"
```

### Migration Timeline

1. **Deprecation Date (2025-06-01)**: v1 marked as deprecated, warnings begin
2. **Migration Period (6 months)**: Both v1 and v2 available
3. **Sunset Date (2025-12-01)**: v1 removed, returns 410 Gone

## Feature Flags

### Available Flags

```typescript
// Core Features
HORIZON_QUARTERS: false        // Quarterly horizon calculations
RESERVES_V1_1: false           // Improved reserves algorithm
CIRCUIT_BREAKER: true          // Circuit breaker protection
CHART_VREG: false             // Regression charts

// Performance
QUERY_CACHE: true             // Query result caching
PARALLEL_SIMULATIONS: false  // Parallel Monte Carlo
SMART_POOLING: true          // Intelligent connection pooling

// API Features
API_VERSIONING: true         // Version headers
DEPRECATION_WARNINGS: true   // Deprecation notices
OPENAPI_DOCS: true          // API documentation
RATE_LIMITING: true         // Rate limiting

// Security
IDEMPOTENCY: true           // Idempotency support
REQUEST_DEDUP: true         // Request deduplication
SECURITY_HEADERS: true      // Security headers

// Monitoring
SLOW_QUERY_LOGGING: true    // Log slow queries
METRICS_COLLECTION: true    // Prometheus metrics
HEALTH_CHECKS: true         // Health endpoints
```

### Configuring Features

Set feature flags via environment variables:

```bash
# Enable features
export HORIZON_QUARTERS=true
export PARALLEL_SIMULATIONS=true
export DEBUG_MODE=true

# Disable features
export RATE_LIMITING=false
export METRICS_COLLECTION=false
```

### Using Features in Code

```typescript
import { features, isFeatureEnabled } from '@shared/config/features';

// Check if feature is enabled
if (isFeatureEnabled('PARALLEL_SIMULATIONS')) {
  await runParallelSimulations();
} else {
  await runSequentialSimulations();
}

// Direct access
if (features.DEBUG_MODE) {
  console.log('Debug information:', data);
}
```

## OpenAPI Documentation

### Accessing Documentation

Documentation is available at:
- **Swagger UI**: `/docs` (redirects to current version)
- **v1 Docs**: `/docs/v1` (deprecated)
- **v2 Docs**: `/docs/v2` (current)
- **OpenAPI Spec**: `/docs/openapi.json`
- **YAML Spec**: `/docs/openapi.yaml`

### API Explorer

The Swagger UI provides:
- Interactive API testing
- Request/response examples
- Authentication setup
- Schema validation
- Code generation

### Authentication

Configure authentication in Swagger UI:

1. **API Key**:
   - Click "Authorize"
   - Enter your API key in `X-API-Key`

2. **Bearer Token**:
   - Click "Authorize"
   - Enter token as `Bearer <token>`

3. **OAuth2**:
   - Click "Authorize"
   - Complete OAuth flow

## Version-Specific Implementation

### Creating Version-Specific Routes

```typescript
import { versionRoute } from './middleware/api-version';

// Different implementations per version
app.get('/api/funds', versionRoute({
  v1: (req, res) => {
    // Legacy implementation
    res.json({ funds: legacyFormat });
  },
  v2: (req, res) => {
    // Current implementation
    res.json({ 
      items: funds,
      pagination: { ... }
    });
  },
  v3: (req, res) => {
    // Beta implementation
    res.json({ 
      data: funds,
      meta: { ... },
      links: { ... }
    });
  },
  default: (req, res) => {
    // Fallback for unknown versions
    res.status(501).json({ error: 'Not Implemented' });
  }
}));
```

### Requiring Specific Versions

```typescript
import { requireVersion } from './middleware/api-version';

// Require minimum version
app.post('/api/advanced-simulation', 
  requireVersion('v2'),
  (req, res) => {
    // Only available in v2+
  }
);

// Require version range
app.get('/api/legacy-report',
  requireVersion('v1', 'v2'),
  (req, res) => {
    // Available in v1 and v2, not v3
  }
);
```

## Client Implementation

### JavaScript/TypeScript

```typescript
class UpdogAPIClient {
  constructor(
    private baseURL: string,
    private version: string = 'v2'
  ) {}
  
  async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'API-Version': this.version,
        'Content-Type': 'application/json',
      },
    });
    
    // Check for deprecation
    if (response.headers.get('Deprecation') === 'true') {
      console.warn(
        `API version ${this.version} is deprecated. ` +
        `Sunset: ${response.headers.get('Sunset')}`
      );
    }
    
    return response;
  }
}

const client = new UpdogAPIClient('https://api.updog.example', 'v2');
```

### Python

```python
import requests
import warnings

class UpdogAPIClient:
    def __init__(self, base_url, version='v2'):
        self.base_url = base_url
        self.version = version
        self.session = requests.Session()
        self.session.headers.update({
            'API-Version': version,
            'Content-Type': 'application/json'
        })
    
    def request(self, method, path, **kwargs):
        response = self.session.request(
            method,
            f"{self.base_url}{path}",
            **kwargs
        )
        
        # Check deprecation
        if response.headers.get('Deprecation') == 'true':
            warnings.warn(
                f"API version {self.version} is deprecated. "
                f"Sunset: {response.headers.get('Sunset')}"
            )
        
        return response

client = UpdogAPIClient('https://api.updog.example', 'v2')
```

### cURL

```bash
# Specify version in header
curl -H "API-Version: v2" https://api.updog.example/api/funds

# Specify version in path
curl https://api.updog.example/api/v2/funds

# Check deprecation status
curl -I -H "API-Version: v1" https://api.updog.example/api/funds
```

## Migration Guide

### Migrating from v1 to v2

#### 1. Response Format Changes

**v1 Response:**
```json
{
  "funds": [...],
  "total": 100
}
```

**v2 Response:**
```json
{
  "items": [...],
  "total": 100,
  "limit": 20,
  "offset": 0,
  "hasMore": true
}
```

#### 2. Error Format Changes

**v1 Error:**
```json
{
  "error": "Not found"
}
```

**v2 Error:**
```json
{
  "error": "Not Found",
  "message": "Fund with ID 123 not found",
  "code": "FUND_NOT_FOUND",
  "details": { "id": "123" }
}
```

#### 3. New Features in v2

- Idempotency support (`Idempotency-Key` header)
- Request deduplication
- Enhanced rate limiting
- Circuit breaker protection
- Detailed error codes
- Pagination metadata

### Testing Version Migration

```bash
# Test v1 endpoint
curl -H "API-Version: v1" https://api.updog.example/api/funds

# Test v2 endpoint
curl -H "API-Version: v2" https://api.updog.example/api/funds

# Compare responses
diff v1-response.json v2-response.json
```

## Monitoring

### Version Usage Metrics

Monitor API version usage:

```promql
# Requests by version
rate(http_requests_total[5m]) by (api_version)

# Deprecated version usage
rate(http_requests_total{api_version="v1"}[5m])

# Version adoption rate
sum(rate(http_requests_total{api_version="v2"}[5m])) /
sum(rate(http_requests_total[5m]))
```

### Deprecation Alerts

```yaml
alert: HighDeprecatedAPIUsage
expr: |
  rate(http_requests_total{api_version="v1"}[5m]) > 0.1
for: 5m
annotations:
  summary: "High usage of deprecated API v1"
  description: "{{ $value }} req/s still using deprecated v1"
```

## Best Practices

### For API Providers

1. **Announce deprecation early** (6+ months notice)
2. **Provide clear migration guides**
3. **Include deprecation headers** in all responses
4. **Log deprecated API usage** for monitoring
5. **Offer migration tools** or scripts
6. **Support multiple versions** during transition

### For API Consumers

1. **Specify version explicitly** in all requests
2. **Monitor deprecation headers** in responses
3. **Test against new versions** before sunset
4. **Update clients gradually** with feature flags
5. **Handle version errors** gracefully
6. **Subscribe to API changelog** notifications

## Troubleshooting

### Common Issues

#### Invalid Version Error
```json
{
  "error": "Invalid API version",
  "message": "Version v99 is not supported",
  "supported": ["v1", "v2", "v3"]
}
```
**Solution**: Use a supported version from the list.

#### Version Not Implemented
```json
{
  "error": "Not Implemented",
  "message": "This endpoint is not available in API version v3",
  "availableVersions": ["v1", "v2"]
}
```
**Solution**: Use a version that implements the endpoint.

#### Sunset Version
```json
{
  "error": "Gone",
  "message": "API version v0 has been sunset as of 2024-01-01",
  "successor": "/api/v2"
}
```
**Solution**: Migrate to the successor version.

## Support

For API versioning support:
- Documentation: `/docs`
- Changelog: `/api/changelog`
- Support: api-support@updog.example
- Status: status.updog.example