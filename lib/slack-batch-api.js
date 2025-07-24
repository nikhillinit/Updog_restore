#!/usr/bin/env node

/**
 * Slack Batch API Utility
 * 
 * High-performance utility for batching Slack API calls with intelligent caching.
 * Optimizes repeated calls to conversations.members, users.info, etc.
 * 
 * Features:
 * - Batches up to 50 IDs per request
 * - Parallel request execution
 * - In-memory and Redis cache support
 * - Automatic deduplication
 * - Configurable TTL
 * - Error handling and retries
 */

import { WebClient } from '@slack/web-api';
import Redis from 'ioredis';
import { recordSlackMetrics, exportToPerformanceLog } from './slack-observability-hook.js';

/**
 * Slack Batch API Client with caching and batching capabilities
 */
export class SlackBatchAPI {
  constructor(options = {}) {
    this.client = new WebClient(options.token);
    this.cacheType = options.cacheType || 'memory'; // 'memory' | 'redis'
    this.cacheTTL = options.cacheTTL || 300; // 5 minutes default
    this.batchSize = Math.min(options.batchSize || 50, 50); // Max 50 per Slack API limits
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    // Initialize cache
    this.initializeCache(options.redis);
    
    // Performance metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      batchesSaved: 0
    };
  }

  /**
   * Initialize cache based on configuration
   */
  initializeCache(redisConfig) {
    if (this.cacheType === 'redis') {
      this.redis = new Redis(redisConfig || {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: 0,
        keyPrefix: 'slack:cache:'
      });
      
      this.redis.on('error', (error) => {
        console.error('Redis connection error:', error);
        // Fallback to memory cache
        this.cacheType = 'memory';
        this.initializeMemoryCache();
      });
      
      console.log('✅ Redis cache initialized');
    } else {
      this.initializeMemoryCache();
    }
  }

  /**
   * Initialize in-memory cache with TTL cleanup
   */
  initializeMemoryCache() {
    this.memoryCache = new Map();
    this.cacheTimestamps = new Map();
    
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);
    
    console.log('✅ Memory cache initialized');
  }

  /**
   * Clean up expired cache entries (memory cache only)
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.cacheTTL * 1000) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => {
      this.memoryCache.delete(key);
      this.cacheTimestamps.delete(key);
    });
    
    if (expiredKeys.length > 0) {
      console.log(`🧹 Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Get value from cache
   */
  async getCached(key) {
    if (this.cacheType === 'redis') {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Redis get error:', error);
        return null;
      }
    } else {
      // Check TTL for memory cache
      const timestamp = this.cacheTimestamps.get(key);
      if (timestamp && Date.now() - timestamp <= this.cacheTTL * 1000) {
        return this.memoryCache.get(key);
      }
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async setCached(key, value) {
    if (this.cacheType === 'redis') {
      try {
        await this.redis.setex(key, this.cacheTTL, JSON.stringify(value));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    } else {
      this.memoryCache.set(key, value);
      this.cacheTimestamps.set(key, Date.now());
    }
  }

  /**
   * Get multiple values from cache
   */
  async getCachedBatch(keys) {
    const results = {};
    const hits = [];
    const misses = [];

    if (this.cacheType === 'redis') {
      try {
        const pipeline = this.redis.pipeline();
        keys.forEach(key => pipeline.get(key));
        const responses = await pipeline.exec();
        
        keys.forEach((key, index) => {
          const [error, value] = responses[index];
          if (!error && value) {
            results[key] = JSON.parse(value);
            hits.push(key);
          } else {
            misses.push(key);
          }
        });
      } catch (error) {
        console.error('Redis batch get error:', error);
        misses.push(...keys);
      }
    } else {
      const now = Date.now();
      keys.forEach(key => {
        const timestamp = this.cacheTimestamps.get(key);
        if (timestamp && now - timestamp <= this.cacheTTL * 1000) {
          results[key] = this.memoryCache.get(key);
          hits.push(key);
        } else {
          misses.push(key);
        }
      });
    }

    this.metrics.cacheHits += hits.length;
    this.metrics.cacheMisses += misses.length;

    return { results, misses };
  }

  /**
   * Set multiple values in cache
   */
  async setCachedBatch(entries) {
    if (this.cacheType === 'redis') {
      try {
        const pipeline = this.redis.pipeline();
        Object.entries(entries).forEach(([key, value]) => {
          pipeline.setex(key, this.cacheTTL, JSON.stringify(value));
        });
        await pipeline.exec();
      } catch (error) {
        console.error('Redis batch set error:', error);
      }
    } else {
      const now = Date.now();
      Object.entries(entries).forEach(([key, value]) => {
        this.memoryCache.set(key, value);
        this.cacheTimestamps.set(key, now);
      });
    }
  }

  /**
   * Execute Slack API call with retry logic
   */
  async executeWithRetry(apiCall, retryCount = 0) {
    try {
      return await apiCall();
    } catch (error) {
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        console.warn(`⚠️ API call failed, retrying (${retryCount + 1}/${this.maxRetries})...`);
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.executeWithRetry(apiCall, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    return error.code === 'slack_webapi_rate_limited' || 
           error.code === 'slack_webapi_request_timeout' ||
           (error.data && error.data.error === 'rate_limited');
  }

  /**
   * Delay utility for retries
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch get conversation members
   */
  async getConversationMembers(channelIds) {
    console.log(`🔍 Fetching members for ${channelIds.length} channels...`);
    
    // Remove duplicates
    const uniqueIds = [...new Set(channelIds)];
    
    // Check cache first
    const cacheKeys = uniqueIds.map(id => `conversation_members:${id}`);
    const { results: cachedResults, misses } = await this.getCachedBatch(cacheKeys);
    
    console.log(`📊 Cache: ${Object.keys(cachedResults).length} hits, ${misses.length} misses`);
    
    // Extract channel IDs that need API calls
    const channelsToFetch = misses.map(key => key.replace('conversation_members:', ''));
    
    if (channelsToFetch.length === 0) {
      return this.formatConversationResults(cachedResults);
    }

    // Split into batches and process in parallel
    const batches = this.createBatches(channelsToFetch);
    console.log(`🚀 Processing ${batches.length} batches of conversation member requests`);
    
    const batchPromises = batches.map(batch => 
      this.executeWithRetry(() => this.fetchConversationMembersBatch(batch))
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Merge results and cache
    const freshResults = {};
    const cacheEntries = {};
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        Object.entries(result.value).forEach(([channelId, members]) => {
          freshResults[channelId] = members;
          cacheEntries[`conversation_members:${channelId}`] = members;
        });
      } else {
        console.error(`❌ Batch ${index} failed:`, result.reason);
      }
    });
    
    // Cache fresh results
    await this.setCachedBatch(cacheEntries);
    
    // Merge cached and fresh results
    const allResults = { ...this.formatConversationResults(cachedResults), ...freshResults };
    
    this.metrics.apiCalls += batches.length;
    this.metrics.batchesSaved += Math.max(0, uniqueIds.length - batches.length);
    
    console.log(`✅ Retrieved members for ${Object.keys(allResults).length} channels`);
    return allResults;
  }

  /**
   * Format cached conversation results
   */
  formatConversationResults(cachedResults) {
    const formatted = {};
    Object.entries(cachedResults).forEach(([key, value]) => {
      const channelId = key.replace('conversation_members:', '');
      formatted[channelId] = value;
    });
    return formatted;
  }

  /**
   * Fetch conversation members for a batch of channels
   */
  async fetchConversationMembersBatch(channelIds) {
    const results = {};
    
    // Process each channel in the batch
    await Promise.all(
      channelIds.map(async (channelId) => {
        try {
          const response = await this.client.conversations.members({
            channel: channelId,
            limit: 1000 // Get up to 1000 members per channel
          });
          
          results[channelId] = response.members || [];
        } catch (error) {
          console.error(`❌ Failed to fetch members for channel ${channelId}:`, error.message);
          results[channelId] = []; // Return empty array on error
        }
      })
    );
    
    return results;
  }

  /**
   * Batch get user information
   */
  async getUsersInfo(userIds) {
    console.log(`👥 Fetching info for ${userIds.length} users...`);
    
    // Remove duplicates
    const uniqueIds = [...new Set(userIds)];
    
    // Check cache first
    const cacheKeys = uniqueIds.map(id => `user_info:${id}`);
    const { results: cachedResults, misses } = await this.getCachedBatch(cacheKeys);
    
    console.log(`📊 Cache: ${Object.keys(cachedResults).length} hits, ${misses.length} misses`);
    
    // Extract user IDs that need API calls
    const usersToFetch = misses.map(key => key.replace('user_info:', ''));
    
    if (usersToFetch.length === 0) {
      return this.formatUserResults(cachedResults);
    }

    // Split into batches (users.info supports comma-separated IDs)
    const batches = this.createBatches(usersToFetch);
    console.log(`🚀 Processing ${batches.length} batches of user info requests`);
    
    const batchPromises = batches.map(batch => 
      this.executeWithRetry(() => this.fetchUsersInfoBatch(batch))
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Merge results and cache
    const freshResults = {};
    const cacheEntries = {};
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        Object.entries(result.value).forEach(([userId, userInfo]) => {
          freshResults[userId] = userInfo;
          cacheEntries[`user_info:${userId}`] = userInfo;
        });
      } else {
        console.error(`❌ Batch ${index} failed:`, result.reason);
      }
    });
    
    // Cache fresh results
    await this.setCachedBatch(cacheEntries);
    
    // Merge cached and fresh results
    const allResults = { ...this.formatUserResults(cachedResults), ...freshResults };
    
    this.metrics.apiCalls += batches.length;
    this.metrics.batchesSaved += Math.max(0, uniqueIds.length - batches.length);
    
    console.log(`✅ Retrieved info for ${Object.keys(allResults).length} users`);
    return allResults;
  }

  /**
   * Format cached user results
   */
  formatUserResults(cachedResults) {
    const formatted = {};
    Object.entries(cachedResults).forEach(([key, value]) => {
      const userId = key.replace('user_info:', '');
      formatted[userId] = value;
    });
    return formatted;
  }

  /**
   * Fetch user info for a batch of users
   */
  async fetchUsersInfoBatch(userIds) {
    try {
      // Slack users.info supports comma-separated user IDs
      const response = await this.client.users.info({
        users: userIds.join(','),
        include_locale: true
      });
      
      const results = {};
      
      if (response.users) {
        // Multiple users response
        response.users.forEach(user => {
          results[user.id] = user;
        });
      } else if (response.user) {
        // Single user response
        results[response.user.id] = response.user;
      }
      
      return results;
      
    } catch (error) {
      console.error(`❌ Failed to fetch user info batch:`, error.message);
      
      // Fallback: fetch users individually
      const results = {};
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const response = await this.client.users.info({ user: userId });
            results[userId] = response.user;
          } catch (individualError) {
            console.error(`❌ Failed to fetch user ${userId}:`, individualError.message);
            results[userId] = null;
          }
        })
      );
      
      return results;
    }
  }

  /**
   * Create batches from array of IDs
   */
  createBatches(ids) {
    const batches = [];
    for (let i = 0; i < ids.length; i += this.batchSize) {
      batches.push(ids.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.metrics.cacheHits / totalRequests * 100).toFixed(2) : '0.00';
    
    return {
      ...this.metrics,
      cacheHitRate: `${cacheHitRate}%`,
      totalRequests,
      cacheType: this.cacheType,
      batchSize: this.batchSize,
      rateLimitRetries: this.metrics.rateLimitRetries || 0,
      avgResponseTime: this.metrics.avgResponseTime || null
    };
  }

  /**
   * Export metrics to observability stack (< 10 lines)
   */
  exportMetrics(method = 'batch') {
    const metrics = this.getMetrics();
    
    // Export to Prometheus
    recordSlackMetrics(metrics, method);
    
    // Export to performance log
    return exportToPerformanceLog(metrics, method);
  }

  /**
   * Clear cache
   */
  async clearCache() {
    if (this.cacheType === 'redis') {
      try {
        const keys = await this.redis.keys('*');
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
        console.log(`🧹 Cleared ${keys.length} Redis cache entries`);
      } catch (error) {
        console.error('Failed to clear Redis cache:', error);
      }
    } else {
      const count = this.memoryCache.size;
      this.memoryCache.clear();
      this.cacheTimestamps.clear();
      console.log(`🧹 Cleared ${count} memory cache entries`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}

export default SlackBatchAPI;
