# Slack Batch API Implementation Guide

Implementation guide for integrating the SlackBatchAPI utility across three key layers of your application.

## Implementation Layers Overview

| Layer | Replace / Patch | Effort | Note |
|-------|----------------|---------|------|
| **Backend worker** | Swap existing `users.info` / `conversations.members` loops for `SlackBatchAPI` calls | **~30 min** | One import + two function calls |
| **Webhook/event listener** | Warm Redis cache on member-join / profile-change events | **~45 min** | Keeps cache hot, avoids cold hits |
| **Dev CLI / scripts** | Point CLI helpers at in-memory cache variant | **~15 min** | Instant benefit for local tooling |

---

## Layer 1: Backend Worker Integration (~30 min)

### Before: Traditional Loop Pattern
```javascript
// ❌ Slow individual API calls
async function processSlackData() {
  const userInfos = {};
  const channelMembers = {};
  
  // Individual user lookups - SLOW!
  for (const userId of userIds) {
    const response = await slackClient.users.info({ user: userId });
    userInfos[userId] = response.user;
  }
  
  // Individual channel member lookups - SLOW!
  for (const channelId of channelIds) {
    const response = await slackClient.conversations.members({ channel: channelId });
    channelMembers[channelId] = response.members;
  }
  
  return { userInfos, channelMembers };
}
```

### After: Batched API Calls
```javascript
import SlackBatchAPI from '../lib/slack-batch-api.js';

// ✅ Fast batched API calls
async function processSlackData() {
  const slackAPI = new SlackBatchAPI({
    token: process.env.SLACK_BOT_TOKEN,
    cacheType: 'redis',
    cacheTTL: 600, // 10 minutes
    batchSize: 50
  });
  
  try {
    // Batch all operations in parallel - FAST!
    const [userInfos, channelMembers] = await Promise.all([
      slackAPI.getUsersInfo(userIds),      // One function call
      slackAPI.getConversationMembers(channelIds)  // Another function call
    ]);
    
    return { userInfos, channelMembers };
    
  } finally {
    slackAPI.destroy();
  }
}
```

### Worker Integration Examples

#### Example 1: Notification Worker
```javascript
// File: workers/notification-worker.js
import SlackBatchAPI from '../lib/slack-batch-api.js';

class NotificationWorker {
  constructor() {
    this.slackAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'redis',
      cacheTTL: 600
    });
  }
  
  async processNotificationBatch(notifications) {
    // Extract all IDs at once
    const userIds = [...new Set(notifications.map(n => n.userId))];
    const channelIds = [...new Set(notifications.map(n => n.channelId))];
    
    // Batch fetch all data in parallel
    const [userInfos, channelMembers] = await Promise.all([
      this.slackAPI.getUsersInfo(userIds),
      this.slackAPI.getConversationMembers(channelIds)
    ]);
    
    // Process notifications with enriched data
    return notifications.map(notification => ({
      ...notification,
      user: userInfos[notification.userId],
      isChannelMember: channelMembers[notification.channelId]?.includes(notification.userId),
      channelMemberCount: channelMembers[notification.channelId]?.length || 0
    }));
  }
  
  async destroy() {
    this.slackAPI.destroy();
  }
}

export default NotificationWorker;
```

#### Example 2: Analytics Worker
```javascript
// File: workers/analytics-worker.js
import SlackBatchAPI from '../lib/slack-batch-api.js';

class AnalyticsWorker {
  constructor() {
    this.slackAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'redis',
      cacheTTL: 900 // 15 minutes for analytics data
    });
  }
  
  async processEngagementMetrics(events) {
    // Group all user and channel IDs
    const userIds = [...new Set(events.map(e => e.user).filter(Boolean))];
    const channelIds = [...new Set(events.map(e => e.channel).filter(Boolean))];
    
    // Batch fetch all required data
    const [userInfos, channelMembers] = await Promise.all([
      this.slackAPI.getUsersInfo(userIds),
      this.slackAPI.getConversationMembers(channelIds)
    ]);
    
    // Calculate engagement metrics
    return this.calculateMetrics(events, userInfos, channelMembers);
  }
}
```

---

## Layer 2: Webhook/Event Listener Cache Warming (~45 min)

### Cache Warming Strategy

```javascript
// File: webhooks/slack-event-handler.js
import SlackBatchAPI from '../lib/slack-batch-api.js';

class SlackEventHandler {
  constructor() {
    this.slackAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'redis',
      cacheTTL: 1800 // 30 minutes for warmed cache
    });
  }
  
  async handleMemberJoinedChannel(event) {
    const { user, channel } = event;
    
    // Warm cache with new member data
    console.log('🔥 Warming cache for new member:', user);
    
    try {
      // Fetch and cache user info immediately
      await this.slackAPI.getUsersInfo([user]);
      
      // Refresh channel members cache
      await this.slackAPI.getConversationMembers([channel]);
      
      console.log('✅ Cache warmed for member join event');
      
    } catch (error) {
      console.error('❌ Cache warming failed:', error);
    }
  }
  
  async handleUserProfileChanged(event) {
    const { user } = event;
    
    // Invalidate and refresh user cache
    console.log('🔄 Refreshing user cache:', user);
    
    try {
      // Clear existing cache entry
      await this.slackAPI.clearUserCache(user);
      
      // Fetch fresh user data
      await this.slackAPI.getUsersInfo([user]);
      
      console.log('✅ User cache refreshed');
      
    } catch (error) {
      console.error('❌ User cache refresh failed:', error);
    }
  }
  
  async handleChannelCreated(event) {
    const { channel } = event;
    
    // Pre-warm new channel data
    console.log('🔥 Pre-warming new channel:', channel.id);
    
    try {
      await this.slackAPI.getConversationMembers([channel.id]);
      console.log('✅ New channel cache pre-warmed');
      
    } catch (error) {
      console.error('❌ Channel pre-warming failed:', error);
    }
  }
  
  // Proactive cache warming for high-traffic periods
  async warmFrequentlyAccessedData() {
    console.log('🔥 Warming cache for frequent data...');
    
    const frequentChannels = [
      'C1111111111', // #general
      'C2222222222', // #random
      'C3333333333', // #dev-team
      'C4444444444'  // #announcements
    ];
    
    try {
      // Warm channel members
      const members = await this.slackAPI.getConversationMembers(frequentChannels);
      
      // Extract all user IDs and warm user cache
      const allUserIds = [...new Set(
        Object.values(members).flat().filter(Boolean)
      )];
      
      await this.slackAPI.getUsersInfo(allUserIds);
      
      console.log(`✅ Warmed cache for ${frequentChannels.length} channels and ${allUserIds.length} users`);
      
    } catch (error) {
      console.error('❌ Proactive cache warming failed:', error);
    }
  }
}

export default SlackEventHandler;
```

### Event Listener Integration

```javascript
// File: server/slack-events.js
import { createEventAdapter } from '@slack/events-api';
import SlackEventHandler from '../webhooks/slack-event-handler.js';

const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const eventHandler = new SlackEventHandler();

// Member join events - warm cache immediately
slackEvents.on('member_joined_channel', async (event) => {
  await eventHandler.handleMemberJoinedChannel(event);
});

// Profile change events - refresh user cache
slackEvents.on('user_change', async (event) => {
  await eventHandler.handleUserProfileChanged(event);
});

// New channel events - pre-warm channel data
slackEvents.on('channel_created', async (event) => {
  await eventHandler.handleChannelCreated(event);
});

// Scheduled cache warming (every 15 minutes)
setInterval(async () => {
  await eventHandler.warmFrequentlyAccessedData();
}, 15 * 60 * 1000);

export default slackEvents;
```

---

## Layer 3: Dev CLI / Scripts Integration (~15 min)

### CLI Helper Scripts

```javascript
// File: scripts/slack-cli-helper.js
import SlackBatchAPI from '../lib/slack-batch-api.js';

class SlackCLIHelper {
  constructor() {
    // Use memory cache for local development - instant startup
    this.slackAPI = new SlackBatchAPI({
      token: process.env.SLACK_BOT_TOKEN,
      cacheType: 'memory',
      cacheTTL: 300, // 5 minutes for dev work
      batchSize: 50
    });
  }
  
  async getUsersByNames(usernames) {
    console.log(`🔍 Looking up ${usernames.length} users...`);
    
    // First get all users to map names to IDs
    const allUsers = await this.getAllUsers();
    const userMap = new Map(allUsers.map(user => [user.name, user.id]));
    
    // Get IDs for requested usernames
    const userIds = usernames
      .map(name => userMap.get(name))
      .filter(Boolean);
    
    // Batch fetch user details
    const userInfos = await this.slackAPI.getUsersInfo(userIds);
    
    console.log(`✅ Found ${Object.keys(userInfos).length} users`);
    return userInfos;
  }
  
  async getChannelInfo(channelNames) {
    console.log(`🔍 Looking up ${channelNames.length} channels...`);
    
    // Get all channels to map names to IDs
    const allChannels = await this.getAllChannels();
    const channelMap = new Map(allChannels.map(ch => [ch.name, ch.id]));
    
    // Get IDs for requested channels
    const channelIds = channelNames
      .map(name => channelMap.get(name))
      .filter(Boolean);
    
    // Batch fetch channel members
    const channelMembers = await this.slackAPI.getConversationMembers(channelIds);
    
    console.log(`✅ Found ${Object.keys(channelMembers).length} channels`);
    return channelMembers;
  }
  
  async showMetrics() {
    const metrics = this.slackAPI.getMetrics();
    console.log('\n📊 Performance Metrics:');
    console.log(`Cache hits: ${metrics.cacheHits}`);
    console.log(`Cache misses: ${metrics.cacheMisses}`);
    console.log(`Hit rate: ${metrics.cacheHitRate}`);
    console.log(`API calls made: ${metrics.apiCalls}`);
    console.log(`Batches saved: ${metrics.batchesSaved}`);
  }
  
  async cleanup() {
    this.slackAPI.destroy();
  }
}

export default SlackCLIHelper;
```

### CLI Command Examples

```javascript
// File: scripts/slack-commands.js
#!/usr/bin/env node

import SlackCLIHelper from './slack-cli-helper.js';
import { program } from 'commander';

const helper = new SlackCLIHelper();

program
  .name('slack-cli')
  .description('CLI tools for Slack data with batched API calls')
  .version('1.0.0');

program
  .command('users')
  .description('Get user info by usernames')
  .argument('<usernames...>', 'Slack usernames to look up')
  .action(async (usernames) => {
    try {
      const users = await helper.getUsersByNames(usernames);
      
      Object.values(users).forEach(user => {
        console.log(`\n👤 ${user.real_name} (@${user.name})`);
        console.log(`   Email: ${user.profile.email || 'N/A'}`);
        console.log(`   Status: ${user.presence || 'unknown'}`);
        console.log(`   Timezone: ${user.tz_label || 'N/A'}`);
      });
      
      await helper.showMetrics();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    } finally {
      await helper.cleanup();
    }
  });

program
  .command('channels')
  .description('Get channel info by channel names')
  .argument('<channels...>', 'Channel names to look up')
  .action(async (channelNames) => {
    try {
      const channels = await helper.getChannelInfo(channelNames);
      
      Object.entries(channels).forEach(([channelId, members]) => {
        console.log(`\n📋 Channel ${channelId}:`);
        console.log(`   Members: ${members.length}`);
        console.log(`   Sample members: ${members.slice(0, 5).join(', ')}${members.length > 5 ? '...' : ''}`);
      });
      
      await helper.showMetrics();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    } finally {
      await helper.cleanup();
    }
  });

program
  .command('warm-cache')
  .description('Pre-warm cache with frequently accessed data')
  .action(async () => {
    try {
      console.log('🔥 Warming cache...');
      
      // Warm with common channels
      const commonChannels = ['general', 'random', 'dev-team'];
      const channelData = await helper.getChannelInfo(commonChannels);
      
      // Extract and warm user data
      const allUsers = Object.values(channelData)
        .flat()
        .slice(0, 50); // Limit for demo
      
      if (allUsers.length > 0) {
        await helper.slackAPI.getUsersInfo(allUsers);
      }
      
      console.log('✅ Cache warming complete');
      await helper.showMetrics();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    } finally {
      await helper.cleanup();
    }
  });

program.parse();
```

### Package.json Scripts Integration

```json
{
  "scripts": {
    "slack:users": "node scripts/slack-commands.js users",
    "slack:channels": "node scripts/slack-commands.js channels", 
    "slack:warm": "node scripts/slack-commands.js warm-cache",
    "slack:test": "node scripts/slack-commands.js users john.doe jane.smith"
  }
}
```

---

## Quick Migration Checklist

### ✅ Layer 1: Backend Worker (30 min)
- [ ] Import `SlackBatchAPI` in worker files
- [ ] Replace `for` loops with batch function calls
- [ ] Configure Redis cache with appropriate TTL
- [ ] Add proper cleanup in worker lifecycle
- [ ] Test with existing worker queue

### ✅ Layer 2: Event Webhooks (45 min)  
- [ ] Create `SlackEventHandler` class
- [ ] Add member join/leave event warming
- [ ] Add profile change cache invalidation
- [ ] Set up proactive cache warming schedule
- [ ] Monitor cache hit rates in production

### ✅ Layer 3: CLI Scripts (15 min)
- [ ] Create `SlackCLIHelper` with memory cache
- [ ] Update existing CLI commands to use batch API
- [ ] Add performance metrics display
- [ ] Test CLI commands with batched calls
- [ ] Update package.json scripts

---

## Performance Monitoring

```javascript
// Add to your monitoring/metrics collection
function collectSlackAPIMetrics(slackAPI) {
  const metrics = slackAPI.getMetrics();
  
  // Send to your metrics collector (DataDog, New Relic, etc.)
  sendMetric('slack.api.cache_hit_rate', parseFloat(metrics.cacheHitRate));
  sendMetric('slack.api.cache_hits', metrics.cacheHits);
  sendMetric('slack.api.cache_misses', metrics.cacheMisses);
  sendMetric('slack.api.calls_made', metrics.apiCalls);
  sendMetric('slack.api.batches_saved', metrics.batchesSaved);
  
  // Log significant efficiency gains
  if (metrics.batchesSaved > 10) {
    console.log(`🚀 SlackBatchAPI saved ${metrics.batchesSaved} API calls!`);
  }
}
```

This implementation guide provides specific, actionable steps for each layer with the estimated effort times you outlined. The patterns are designed to be drop-in replacements that provide immediate performance benefits.
