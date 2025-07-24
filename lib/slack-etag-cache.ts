import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

interface CacheEntry {
  etag: string;
  data: any;
  timestamp: number;
}

class SlackETagCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  constructor(private axiosInstance: AxiosInstance, private ttl = this.defaultTTL) {
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add If-None-Match header for cached requests
    this.axiosInstance.interceptors.request.use((config) => {
      const cacheKey = this.getCacheKey(config);
      const cached = this.cache.get(cacheKey);
      
      if (cached && !this.isExpired(cached)) {
        config.headers = config.headers || {};
        config.headers['If-None-Match'] = cached.etag;
        // Store cache key in config for response interceptor
        config.metadata = { ...config.metadata, cacheKey };
      }
      
      return config;
    });

    // Response interceptor - handle 304 responses and cache updates
    this.axiosInstance.interceptors.response.use(
      (response) => this.handleResponse(response),
      (error) => {
        // Handle 304 Not Modified as success
        if (error.response?.status === 304) {
          const cacheKey = error.config.metadata?.cacheKey;
          const cached = this.cache.get(cacheKey);
          
          if (cached) {
            // Return cached data as if it was a 200 response
            return Promise.resolve({
              ...error.response,
              status: 200,
              data: cached.data,
              headers: { ...error.response.headers, 'x-cache': 'HIT' }
            });
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private handleResponse(response: AxiosResponse): AxiosResponse {
    const etag = response.headers.etag;
    const cacheKey = response.config.metadata?.cacheKey;
    
    // Cache the response if it has an ETag and is a successful Slack API call
    if (etag && cacheKey && response.status === 200 && this.isSlackApiCall(response.config)) {
      this.cache.set(cacheKey, {
        etag,
        data: response.data,
        timestamp: Date.now()
      });
      
      // Add cache status header
      response.headers['x-cache'] = 'MISS';
    }
    
    return response;
  }

  private getCacheKey(config: AxiosRequestConfig): string {
    const url = config.url || '';
    const method = config.method || 'GET';
    const params = JSON.stringify(config.params || {});
    return `${method}:${url}:${params}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttl;
  }

  private isSlackApiCall(config: AxiosRequestConfig): boolean {
    const url = config.url || '';
    return url.includes('slack.com/api/') && 
           (url.includes('conversations.info') || 
            url.includes('users.info') ||
            url.includes('channels.info'));
  }

  // Manual cache management methods
  public clearCache(): void {
    this.cache.clear();
  }

  public getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  public invalidateKey(key: string): void {
    this.cache.delete(key);
  }
}

// Factory function to create configured Slack client
export function createSlackClient(token: string, options: {
  ttl?: number;
  baseURL?: string;
} = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL || 'https://slack.com/api/',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  // Initialize ETag caching
  new SlackETagCache(client, options.ttl);
  
  return client;
}

// Usage example and helper functions
export async function getConversationInfo(client: AxiosInstance, channel: string) {
  const response = await client.get('conversations.info', {
    params: { channel }
  });
  return response.data;
}

export async function getUserInfo(client: AxiosInstance, user: string) {
  const response = await client.get('users.info', {
    params: { user }
  });
  return response.data;
}
