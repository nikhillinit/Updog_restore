# Slack ETag Caching Integration Guide

## Code Example

The main implementation is in `lib/slack-etag-cache.ts` which provides:

```typescript
// Basic usage
import { createSlackClient, getConversationInfo, getUserInfo } from './lib/slack-etag-cache';

const slackClient = createSlackClient(process.env.SLACK_TOKEN, {
  ttl: 5 * 60 * 1000, // 5 minutes
  baseURL: 'https://slack.com/api/'
});

// These calls will automatically use ETag caching
const channelInfo = await getConversationInfo(slackClient, 'C1234567890');
const userInfo = await getUserInfo(slackClient, 'U1234567890');
```

## Integration Instructions

### 1. Replace existing HTTP client initialization

**Before:**
```typescript
const axios = require('axios');
const slackClient = axios.create({
  baseURL: 'https://slack.com/api/',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**After:**
```typescript
import { createSlackClient } from './lib/slack-etag-cache';
const slackClient = createSlackClient(token, { ttl: 300000 });
```

### 2. For existing Axios instances

```typescript
import { SlackETagCache } from './lib/slack-etag-cache';

// Add to existing client
const cache = new SlackETagCache(existingAxiosInstance, 300000);
```

### 3. Python equivalent (requests.Session)

```python
import requests
from typing import Dict, Any
import time
import json

class SlackETagCache:
    def __init__(self, session: requests.Session, ttl: int = 300):
        self.session = session
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.ttl = ttl
        
    def get(self, url: str, **kwargs) -> requests.Response:
        cache_key = self._get_cache_key(url, kwargs.get('params', {}))
        cached = self.cache.get(cache_key)
        
        if cached and not self._is_expired(cached):
            kwargs.setdefault('headers', {})
            kwargs['headers']['If-None-Match'] = cached['etag']
            
        response = self.session.get(url, **kwargs)
        
        if response.status_code == 304 and cached:
            # Return cached data
            response._content = json.dumps(cached['data']).encode()
            response.status_code = 200
            
        elif response.status_code == 200 and 'etag' in response.headers:
            self.cache[cache_key] = {
                'etag': response.headers['etag'],
                'data': response.json(),
                'timestamp': time.time()
            }
            
        return response
```

## Recommended Cache Configuration

### Default Settings
```typescript
const cacheConfig = {
  ttl: 5 * 60 * 1000,        // 5 minutes TTL
  maxEntries: 1000,          // Max cache entries
  storageStrategy: 'memory'   // In-memory storage
};
```

### Environment-Specific Configs

**Development:**
```typescript
{
  ttl: 30 * 1000,           // 30 seconds for faster testing
  maxEntries: 100
}
```

**Production:**
```typescript
{
  ttl: 10 * 60 * 1000,      // 10 minutes for production
  maxEntries: 5000,
  persistCache: true         // Optional: persist to Redis
}
```

### Storage Strategy Options

1. **Memory (Default)** - Fast, but lost on restart
2. **Redis** - Persistent, shared across instances
3. **File System** - Persistent, single instance

### Cache Invalidation

```typescript
// Manual invalidation
slackClient.clearCache();

// Invalidate specific entries
slackClient.invalidateKey('GET:conversations.info:{"channel":"C123"}');

// Auto-invalidation based on events
slackClient.on('channel_update', (event) => {
  slackClient.invalidateKey(`*conversations.info*${event.channel}*`);
});
```

## Monitoring

Track cache performance:

```typescript
const stats = slackClient.getCacheStats();
console.log(`Cache size: ${stats.size}, Hit ratio: ${stats.hitRatio}%`);
```

Set up alerts for cache misses > 70% indicating stale ETags or high churn.
