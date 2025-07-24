#!/usr/bin/env node

/**
 * Example Usage of Slack Batch API Utility
 * 
 * This file demonstrates how to integrate the SlackBatchAPI into existing workflows
 * with various caching strategies and performance optimizations.
 */

import SlackBatchAPI from '../lib/slack-batch-api.js';

/**
 * Example 1: Basic usage with memory cache
 */
async function basicUsageExample() {
  console.log('🚀 Example 1: Basic usage with memory cache');
  
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'memory',
    cacheTTL: 300, // 5 minutes
    batchSize: 50
  });

  try {
    // Example: Get members for multiple channels
    const channelIds = [
      'C1234567890',
      'C2345678901',
      'C3456789012',
      'C4567890123'
    ];

    const channelMembers = await slackAPI.getConversationMembers(channelIds);
    console.log('Channel members:', Object.keys(channelMembers).length);

    // Example: Get user info for all members
    const allUserIds = Object.values(channelMembers)
      .flat()
      .filter(Boolean); // Remove any null/undefined values

    const userInfos = await slackAPI.getUsersInfo(allUserIds);
    console.log('User infos:', Object.keys(userInfos).length);

    // Show performance metrics
    console.log('Performance metrics:', slackAPI.getMetrics());

  } catch (error) {
    console.error('Error in basic usage example:', error);
  } finally {
    slackAPI.destroy();
  }
}

/**
 * Example 2: Redis cache with custom configuration
 */
async function redisCacheExample() {
  console.log('🚀 Example 2: Redis cache with custom configuration');
  
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'redis',
    cacheTTL: 600, // 10 minutes for Redis
    batchSize: 25, // Smaller batches for better error handling
    maxRetries: 5,
    retryDelay: 2000,
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 1, // Use different DB for Slack cache
      keyPrefix: 'slack:v2:',
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100
    }
  });

  try {
    // Simulate a large batch operation
    const largeChannelList = Array.from({ length: 150 }, (_, i) => `C${i.toString().padStart(9, '0')}`);
    
    console.time('Large batch operation');
    const members = await slackAPI.getConversationMembers(largeChannelList);
    console.timeEnd('Large batch operation');

    console.log('Results:', Object.keys(members).length);
    console.log('Metrics:', slackAPI.getMetrics());

  } catch (error) {
    console.error('Error in Redis cache example:', error);
  } finally {
    slackAPI.destroy();
  }
}

/**
 * Example 3: Integration with existing workflow
 */
async function workflowIntegrationExample() {
  console.log('🚀 Example 3: Integration with existing workflow');
  
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'memory',
    cacheTTL: 180 // 3 minutes for fast-changing data
  });

  try {
    // Simulate existing workflow data
    const workflowData = {
      channels: ['C1111111111', 'C2222222222', 'C3333333333'],
      notifications: [
        { userId: 'U1111111111', channelId: 'C1111111111' },
        { userId: 'U2222222222', channelId: 'C2222222222' },
        { userId: 'U3333333333', channelId: 'C3333333333' }
      ]
    };

    // Step 1: Get all channel members (batched)
    console.log('📋 Step 1: Fetching channel members...');
    const channelMembers = await slackAPI.getConversationMembers(workflowData.channels);

    // Step 2: Get user info for specific users (batched)
    console.log('👥 Step 2: Fetching user information...');
    const userIds = workflowData.notifications.map(n => n.userId);
    const userInfos = await slackAPI.getUsersInfo(userIds);

    // Step 3: Process the combined data
    console.log('⚙️ Step 3: Processing combined data...');
    const enrichedNotifications = workflowData.notifications.map(notification => ({
      ...notification,
      user: userInfos[notification.userId],
      channelMemberCount: channelMembers[notification.channelId]?.length || 0,
      isUserInChannel: channelMembers[notification.channelId]?.includes(notification.userId) || false
    }));

    console.log('Enriched notifications:', enrichedNotifications.length);
    console.log('Final metrics:', slackAPI.getMetrics());

    return enrichedNotifications;

  } catch (error) {
    console.error('Error in workflow integration:', error);
    throw error;
  } finally {
    slackAPI.destroy();
  }
}

/**
 * Example 4: Performance comparison - with vs without batching
 */
async function performanceComparisonExample() {
  console.log('🚀 Example 4: Performance comparison');
  
  const userIds = Array.from({ length: 100 }, (_, i) => `U${i.toString().padStart(9, '0')}`);

  // Method 1: Individual API calls (traditional approach)
  console.log('📊 Testing individual API calls...');
  const individualStart = Date.now();
  
  try {
    const traditionalAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'memory',
      batchSize: 1 // Force individual calls
    });

    const individualResults = await traditionalAPI.getUsersInfo(userIds.slice(0, 10)); // Only test 10 to avoid rate limits
    const individualTime = Date.now() - individualStart;
    
    console.log(`Individual calls: ${individualTime}ms for ${Object.keys(individualResults).length} users`);
    console.log('Individual metrics:', traditionalAPI.getMetrics());
    
    traditionalAPI.destroy();
  } catch (error) {
    console.error('Error in individual calls test:', error);
  }

  // Method 2: Batched API calls
  console.log('📊 Testing batched API calls...');
  const batchedStart = Date.now();
  
  try {
    const batchedAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'memory',
      batchSize: 50
    });

    const batchedResults = await batchedAPI.getUsersInfo(userIds.slice(0, 10));
    const batchedTime = Date.now() - batchedStart;
    
    console.log(`Batched calls: ${batchedTime}ms for ${Object.keys(batchedResults).length} users`);
    console.log('Batched metrics:', batchedAPI.getMetrics());
    
    const speedup = individualTime > 0 ? (individualTime / batchedTime).toFixed(2) : 'N/A';
    console.log(`🚄 Performance improvement: ${speedup}x faster`);
    
    batchedAPI.destroy();
  } catch (error) {
    console.error('Error in batched calls test:', error);
  }
}

/**
 * Example 5: Error handling and resilience
 */
async function errorHandlingExample() {
  console.log('🚀 Example 5: Error handling and resilience');
  
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'memory',
    maxRetries: 3,
    retryDelay: 1000
  });

  try {
    // Test with mix of valid and invalid IDs
    const mixedChannelIds = [
      'C1234567890', // Potentially valid
      'INVALID_ID_1',
      'C2345678901', // Potentially valid
      'INVALID_ID_2',
      'C3456789012'  // Potentially valid
    ];

    console.log('Testing error resilience with mixed valid/invalid IDs...');
    const results = await slackAPI.getConversationMembers(mixedChannelIds);
    
    console.log('Results received:', Object.keys(results).length);
    
    // Show which channels had data vs errors
    Object.entries(results).forEach(([channelId, members]) => {
      console.log(`Channel ${channelId}: ${Array.isArray(members) ? members.length : 'error'} members`);
    });

  } catch (error) {
    console.error('Error in error handling example:', error);
  } finally {
    slackAPI.destroy();
  }
}

/**
 * Example 6: Cache warming strategy
 */
async function cacheWarmingExample() {
  console.log('🚀 Example 6: Cache warming strategy');
  
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'redis',
    cacheTTL: 1800 // 30 minutes for warmed cache
  });

  try {
    // Step 1: Identify frequently accessed channels and users
    const frequentChannels = [
      'C1111111111', // #general
      'C2222222222', // #random  
      'C3333333333', // #dev-team
      'C4444444444'  // #announcements
    ];

    console.log('🔥 Warming cache with frequent channels...');
    
    // Warm the cache by fetching channel members
    const members = await slackAPI.getConversationMembers(frequentChannels);
    
    // Get all unique user IDs from these channels
    const allUserIds = [...new Set(
      Object.values(members).flat().filter(Boolean)
    )];

    console.log('🔥 Warming cache with user information...');
    
    // Warm the cache with user info
    await slackAPI.getUsersInfo(allUserIds);
    
    console.log('Cache warming completed!');
    console.log('Warmed cache metrics:', slackAPI.getMetrics());
    
    // Simulate subsequent requests (should be very fast)
    console.log('Testing warmed cache performance...');
    const start = Date.now();
    
    await slackAPI.getConversationMembers(frequentChannels.slice(0, 2));
    await slackAPI.getUsersInfo(allUserIds.slice(0, 20));
    
    const warmCacheTime = Date.now() - start;
    console.log(`Warmed cache requests: ${warmCacheTime}ms`);
    console.log('Final metrics:', slackAPI.getMetrics());

  } catch (error) {
    console.error('Error in cache warming example:', error);
  } finally {
    slackAPI.destroy();
  }
}

/**
 * Main function to run examples
 */
async function runExamples() {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('❌ SLACK_BOT_TOKEN environment variable is required');
    console.log('Set it with: export SLACK_BOT_TOKEN=xoxb-your-token-here');
    process.exit(1);
  }

  const examples = [
    basicUsageExample,
    redisCacheExample,
    workflowIntegrationExample,
    performanceComparisonExample,
    errorHandlingExample,
    cacheWarmingExample
  ];

  for (let i = 0; i < examples.length; i++) {
    try {
      await examples[i]();
    } catch (error) {
      console.error(`Example ${i + 1} failed:`, error);
    }
    
    if (i < examples.length - 1) {
      console.log('\n' + '='.repeat(50) + '\n');
      // Small delay between examples
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export {
  basicUsageExample,
  redisCacheExample,
  workflowIntegrationExample,
  performanceComparisonExample,
  errorHandlingExample,
  cacheWarmingExample
};
