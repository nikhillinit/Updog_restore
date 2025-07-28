import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import SlackBatchAPI from '../lib/slack-batch-api.js';
import { SlackService } from '../services/slackService.js';

// Mock Redis
const mockRedis = {
  pipeline: vi.fn(() => ({
    get: vi.fn(),
    setex: vi.fn(),
    exec: vi.fn()
  })),
  get: vi.fn(),
  setex: vi.fn(),
  keys: vi.fn(),
  del: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn()
};

// Mock Slack Web API
const mockSlackClient = {
  users: {
    info: vi.fn()
  },
  conversations: {
    members: vi.fn()
  }
};

vi.mock('ioredis', () => {
  return { default: vi.fn(() => mockRedis) };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn(() => mockSlackClient)
}));

describe('SlackBatchAPI Integration Tests', () => {
  let slackService: SlackService;
  let batchAPI: SlackBatchAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    slackService = new SlackService('test-token', { cacheType: 'redis' });
    batchAPI = new SlackBatchAPI({ token: 'test-token', cacheType: 'redis' });
  });

  afterEach(() => {
    if (slackService) {
      slackService.destroy();
    }
    if (batchAPI) {
      batchAPI.destroy();
    }
  });

  /**
   * Test 1: Batch ≤ 50 IDs
   * Ensures batching respects Slack API limits
   */
  describe('Batch Size Limits', () => {
    it('should batch requests to ≤ 50 IDs per API call', async () => {
      // Generate 120 user IDs (should create 3 batches of 50, 50, 20)
      const userIds = Array.from({ length: 120 }, (_, i) => `U${i.toString().padStart(6, '0')}`);
      
      // Mock Redis cache misses
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue(
          userIds.map(() => [null, null]) // All cache misses
        )
      });

      // Mock successful API responses
      mockSlackClient.users.info.mockImplementation(({ users }) => {
        const userList = users.split(',');
        return Promise.resolve({
          users: userList.map((id: string) => ({
            id,
            name: `user-${id}`,
            real_name: `Real User ${id}`,
            profile: { email: `${id}@test.com` }
          }))
        });
      });

      const results = await batchAPI.getUsersInfo(userIds);

      // Verify results
      expect(Object.keys(results)).toHaveLength(120);
      
      // Verify API was called exactly 3 times (120 IDs / 50 batch size = 3 batches)
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(3);
      
      // Verify each batch had ≤ 50 IDs
      const apiCalls = mockSlackClient.users.info.mock.calls;
      expect(apiCalls[0][0].users.split(',')).toHaveLength(50); // First batch: 50 IDs
      expect(apiCalls[1][0].users.split(',')).toHaveLength(50); // Second batch: 50 IDs  
      expect(apiCalls[2][0].users.split(',')).toHaveLength(20); // Third batch: 20 IDs

      console.log('✅ Batch size test passed: 120 IDs → 3 batches (50+50+20)');
    });

    it('should handle single batch with < 50 IDs', async () => {
      const userIds = ['U123456', 'U789012', 'U345678']; // Only 3 IDs
      
      // Mock Redis cache misses
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(), 
        exec: vi.fn().mockResolvedValue([
          [null, null],
          [null, null],
          [null, null]
        ])
      });

      mockSlackClient.users.info.mockResolvedValue({
        users: userIds.map(id => ({
          id,
          name: `user-${id}`,
          real_name: `Real User ${id}`
        }))
      });

      const results = await batchAPI.getUsersInfo(userIds);

      expect(Object.keys(results)).toHaveLength(3);
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(1);
      expect(mockSlackClient.users.info).toHaveBeenCalledWith({
        users: 'U123456,U789012,U345678',
        include_locale: true
      });

      console.log('✅ Small batch test passed: 3 IDs → 1 batch');
    });
  });

  /**
   * Test 2: Cache Hit Path (Redis mocked)
   * Verifies caching reduces API calls
   */
  describe('Redis Cache Hit Path', () => {
    it('should return cached results without API calls', async () => {
      const userIds = ['U123456', 'U789012'];
      
      // Mock Redis cache hits
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([
          [null, JSON.stringify({ id: 'U123456', name: 'cached-user-1' })],
          [null, JSON.stringify({ id: 'U789012', name: 'cached-user-2' })]
        ])
      });

      const results = await batchAPI.getUsersInfo(userIds);

      // Verify cached results returned
      expect(results).toEqual({
        'U123456': { id: 'U123456', name: 'cached-user-1' },
        'U789012': { id: 'U789012', name: 'cached-user-2' }
      });

      // Verify NO API calls made (all cache hits)
      expect(mockSlackClient.users.info).not.toHaveBeenCalled();

      // Verify metrics show cache hits
      const metrics = batchAPI.getMetrics();
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.cacheHitRate).toBe('100.00%');

      console.log('✅ Cache hit test passed: 2 cache hits, 0 API calls');
    });

    it('should handle mixed cache hits/misses', async () => {
      const userIds = ['U123456', 'U789012', 'U345678'];
      
      // Mock Redis: 2 cache hits, 1 miss
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([
          [null, JSON.stringify({ id: 'U123456', name: 'cached-user-1' })], // Hit
          [null, JSON.stringify({ id: 'U789012', name: 'cached-user-2' })], // Hit  
          [null, null] // Miss
        ])
      });

      // Mock API call for cache miss
      mockSlackClient.users.info.mockResolvedValue({
        users: [{ id: 'U345678', name: 'fresh-user-3' }]
      });

      const results = await batchAPI.getUsersInfo(userIds);

      // Verify mixed results (cached + fresh)
      expect(results).toEqual({
        'U123456': { id: 'U123456', name: 'cached-user-1' },
        'U789012': { id: 'U789012', name: 'cached-user-2' },
        'U345678': { id: 'U345678', name: 'fresh-user-3' }
      });

      // Verify only 1 API call for the cache miss
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(1);
      expect(mockSlackClient.users.info).toHaveBeenCalledWith({
        users: 'U345678',
        include_locale: true
      });

      // Verify metrics
      const metrics = batchAPI.getMetrics();
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHitRate).toBe('66.67%');

      console.log('✅ Mixed cache test passed: 2 hits + 1 miss → 1 API call');
    });
  });

  /**
   * Test 3: Retry on Rate-Limit 429
   * Verifies rate limit handling and retries
   */
  describe('Rate Limit Retry Handling', () => {
    it('should retry on 429 rate limit errors', async () => {
      const userIds = ['U123456'];
      
      // Mock Redis cache miss
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([[null, null]])
      });

      // Mock 429 rate limit error, then success
      mockSlackClient.users.info
        .mockRejectedValueOnce({
          code: 'slack_webapi_rate_limited',
          data: { error: 'rate_limited' }
        })
        .mockRejectedValueOnce({
          code: 'slack_webapi_rate_limited', 
          data: { error: 'rate_limited' }
        })
        .mockResolvedValueOnce({
          users: [{ id: 'U123456', name: 'retry-success-user' }]
        });

      const startTime = Date.now();
      const results = await batchAPI.getUsersInfo(userIds);
      const endTime = Date.now();

      // Verify successful result after retries
      expect(results).toEqual({
        'U123456': { id: 'U123456', name: 'retry-success-user' }
      });

      // Verify 3 total API calls (2 failures + 1 success)
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(3);

      // Verify exponential backoff delay (should be > 1000ms for 2 retries)
      const totalTime = endTime - startTime;
      expect(totalTime).toBeGreaterThan(1000); // 1st retry: 1000ms, 2nd retry: 2000ms

      console.log(`✅ Rate limit retry test passed: 3 attempts, ${totalTime}ms total time`);
    });

    it('should fail after max retries exceeded', async () => {
      const userIds = ['U123456'];
      
      // Mock Redis cache miss
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([[null, null]])
      });

      // Mock persistent 429 errors (exceed max retries)
      mockSlackClient.users.info.mockRejectedValue({
        code: 'slack_webapi_rate_limited',
        data: { error: 'rate_limited' }
      });

      // Should throw error after max retries (3)
      await expect(batchAPI.getUsersInfo(userIds)).rejects.toThrow();

      // Verify 4 total API calls (1 initial + 3 retries)
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(4);

      console.log('✅ Max retries test passed: Failed after 4 attempts');
    });

    it('should not retry on non-retryable errors', async () => {
      const userIds = ['U123456'];
      
      // Mock Redis cache miss
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([[null, null]])
      });

      // Mock non-retryable error (e.g., invalid token)
      mockSlackClient.users.info.mockRejectedValue({
        code: 'slack_webapi_invalid_token',
        data: { error: 'invalid_auth' }
      });

      // Should fail immediately without retries
      await expect(batchAPI.getUsersInfo(userIds)).rejects.toThrow();

      // Verify only 1 API call (no retries)
      expect(mockSlackClient.users.info).toHaveBeenCalledTimes(1);

      console.log('✅ Non-retryable error test passed: Failed immediately, no retries');
    });
  });

  /**
   * Integration Test: SlackService End-to-End
   */
  describe('SlackService Integration', () => {
    it('should process notifications with batching and caching', async () => {
      const notifications = [
        { userId: 'U123456', channelId: 'C111111' },
        { userId: 'U789012', channelId: 'C111111' },
        { userId: 'U123456', channelId: 'C222222' } // Duplicate user
      ];

      // Mock Redis cache (mixed hits/misses)
      mockRedis.pipeline.mockReturnValue({
        get: vi.fn(),
        setex: vi.fn(),
        exec: vi.fn()
          .mockResolvedValueOnce([ // Users cache check
            [null, JSON.stringify({ id: 'U123456', name: 'cached-user' })], // Hit
            [null, null] // Miss for U789012
          ])
          .mockResolvedValueOnce([ // Channels cache check  
            [null, null], // Miss for C111111
            [null, null] // Miss for C222222
          ])
      });

      // Mock API responses
      mockSlackClient.users.info.mockResolvedValue({
        users: [{ id: 'U789012', name: 'fresh-user', real_name: 'Fresh User' }]
      });

      mockSlackClient.conversations.members
        .mockResolvedValueOnce({ members: ['U123456', 'U789012', 'U999999'] }) // C111111
        .mockResolvedValueOnce({ members: ['U123456'] }); // C222222

      const results = await slackService.processNotifications(notifications);

      // Verify enriched results
      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({
        userId: 'U123456',
        channelId: 'C111111',
        user: { id: 'U123456', name: 'cached-user' },
        isChannelMember: true,
        channelMemberCount: 3
      });
      expect(results[1]).toMatchObject({
        userId: 'U789012', 
        channelId: 'C111111',
        user: { id: 'U789012', name: 'fresh-user' },
        isChannelMember: true,
        channelMemberCount: 3
      });
      expect(results[2]).toMatchObject({
        userId: 'U123456',
        channelId: 'C222222', 
        isChannelMember: true,
        channelMemberCount: 1
      });

      // Verify performance metrics
      const metrics = slackService.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.batchesSaved).toBeGreaterThan(0);

      console.log('✅ End-to-end integration test passed');
    });
  });
});
