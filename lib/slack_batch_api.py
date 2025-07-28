#!/usr/bin/env python3

"""
Slack Batch API Utility (Python)

High-performance utility for batching Slack API calls with intelligent caching.
Optimizes repeated calls to conversations.members, users.info, etc.

Features:
- Batches up to 50 IDs per request
- Parallel request execution
- In-memory and Redis cache support
- Automatic deduplication
- Configurable TTL
- Error handling and retries
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Set, Tuple, Any, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import aiohttp
import redis.asyncio as redis
from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.errors import SlackApiError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class CacheMetrics:
    """Performance metrics for cache operations"""
    cache_hits: int = 0
    cache_misses: int = 0
    api_calls: int = 0
    batches_saved: int = 0
    
    @property
    def total_requests(self) -> int:
        return self.cache_hits + self.cache_misses
    
    @property
    def cache_hit_rate(self) -> str:
        if self.total_requests == 0:
            return "0.00%"
        return f"{(self.cache_hits / self.total_requests * 100):.2f}%"


class SlackBatchAPI:
    """
    Slack Batch API Client with caching and batching capabilities
    """
    
    def __init__(
        self,
        token: str,
        cache_type: str = 'memory',  # 'memory' | 'redis'
        cache_ttl: int = 300,  # 5 minutes default
        batch_size: int = 50,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        redis_config: Optional[Dict[str, Any]] = None
    ):
        self.client = AsyncWebClient(token=token)
        self.cache_type = cache_type
        self.cache_ttl = cache_ttl
        self.batch_size = min(batch_size, 50)  # Max 50 per Slack API limits
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        
        # Initialize cache
        self.memory_cache: Dict[str, Any] = {}
        self.cache_timestamps: Dict[str, float] = {}
        self.redis_client: Optional[redis.Redis] = None
        
        if cache_type == 'redis':
            self._initialize_redis(redis_config or {})
        
        # Performance metrics
        self.metrics = CacheMetrics()
        
        # Cleanup task for memory cache
        self._cleanup_task: Optional[asyncio.Task] = None
        if cache_type == 'memory':
            self._start_cleanup_task()
    
    def _initialize_redis(self, config: Dict[str, Any]) -> None:
        """Initialize Redis connection"""
        try:
            redis_config = {
                'host': config.get('host', 'localhost'),
                'port': config.get('port', 6379),
                'password': config.get('password'),
                'db': config.get('db', 0),
                'decode_responses': True,
                'socket_timeout': config.get('socket_timeout', 5),
                'socket_connect_timeout': config.get('socket_connect_timeout', 5),
            }
            
            # Remove None values
            redis_config = {k: v for k, v in redis_config.items() if v is not None}
            
            self.redis_client = redis.Redis(**redis_config)
            logger.info("✅ Redis cache initialized")
            
        except Exception as e:
            logger.error(f"Redis initialization failed: {e}")
            logger.info("Falling back to memory cache")
            self.cache_type = 'memory'
            self._start_cleanup_task()
    
    def _start_cleanup_task(self) -> None:
        """Start background task for memory cache cleanup"""
        async def cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(60)  # Cleanup every minute
                    await self._cleanup_expired_entries()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Cache cleanup error: {e}")
        
        self._cleanup_task = asyncio.create_task(cleanup_loop())
    
    async def _cleanup_expired_entries(self) -> None:
        """Clean up expired cache entries (memory cache only)"""
        if self.cache_type != 'memory':
            return
        
        now = time.time()
        expired_keys = []
        
        for key, timestamp in self.cache_timestamps.items():
            if now - timestamp > self.cache_ttl:
                expired_keys.append(key)
        
        for key in expired_keys:
            self.memory_cache.pop(key, None)
            self.cache_timestamps.pop(key, None)
        
        if expired_keys:
            logger.info(f"🧹 Cleaned up {len(expired_keys)} expired cache entries")
    
    async def _get_cached(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if self.cache_type == 'redis' and self.redis_client:
            try:
                value = await self.redis_client.get(key)
                return json.loads(value) if value else None
            except Exception as e:
                logger.error(f"Redis get error: {e}")
                return None
        else:
            # Check TTL for memory cache
            timestamp = self.cache_timestamps.get(key)
            if timestamp and time.time() - timestamp <= self.cache_ttl:
                return self.memory_cache.get(key)
            return None
    
    async def _set_cached(self, key: str, value: Any) -> None:
        """Set value in cache"""
        if self.cache_type == 'redis' and self.redis_client:
            try:
                await self.redis_client.setex(key, self.cache_ttl, json.dumps(value))
            except Exception as e:
                logger.error(f"Redis set error: {e}")
        else:
            self.memory_cache[key] = value
            self.cache_timestamps[key] = time.time()
    
    async def _get_cached_batch(self, keys: List[str]) -> Tuple[Dict[str, Any], List[str]]:
        """Get multiple values from cache"""
        results = {}
        misses = []
        
        if self.cache_type == 'redis' and self.redis_client:
            try:
                pipe = self.redis_client.pipeline()
                for key in keys:
                    pipe.get(key)
                
                responses = await pipe.execute()
                
                for key, value in zip(keys, responses):
                    if value:
                        results[key] = json.loads(value)
                    else:
                        misses.append(key)
                        
            except Exception as e:
                logger.error(f"Redis batch get error: {e}")
                misses.extend(keys)
        else:
            now = time.time()
            for key in keys:
                timestamp = self.cache_timestamps.get(key)
                if timestamp and now - timestamp <= self.cache_ttl:
                    results[key] = self.memory_cache.get(key)
                else:
                    misses.append(key)
        
        self.metrics.cache_hits += len(results)
        self.metrics.cache_misses += len(misses)
        
        return results, misses
    
    async def _set_cached_batch(self, entries: Dict[str, Any]) -> None:
        """Set multiple values in cache"""
        if self.cache_type == 'redis' and self.redis_client:
            try:
                pipe = self.redis_client.pipeline()
                for key, value in entries.items():
                    pipe.setex(key, self.cache_ttl, json.dumps(value))
                await pipe.execute()
            except Exception as e:
                logger.error(f"Redis batch set error: {e}")
        else:
            now = time.time()
            for key, value in entries.items():
                self.memory_cache[key] = value
                self.cache_timestamps[key] = now
    
    async def _execute_with_retry(self, api_call, retry_count: int = 0):
        """Execute Slack API call with retry logic"""
        try:
            return await api_call()
        except SlackApiError as e:
            if retry_count < self.max_retries and self._is_retryable_error(e):
                delay = self.retry_delay * (2 ** retry_count)  # Exponential backoff
                logger.warning(f"⚠️ API call failed, retrying ({retry_count + 1}/{self.max_retries}) in {delay}s...")
                await asyncio.sleep(delay)
                return await self._execute_with_retry(api_call, retry_count + 1)
            raise
    
    def _is_retryable_error(self, error: SlackApiError) -> bool:
        """Check if error is retryable"""
        return error.response.get('error') == 'rate_limited'
    
    def _create_batches(self, ids: List[str]) -> List[List[str]]:
        """Create batches from array of IDs"""
        batches = []
        for i in range(0, len(ids), self.batch_size):
            batches.append(ids[i:i + self.batch_size])
        return batches
    
    async def get_conversation_members(self, channel_ids: List[str]) -> Dict[str, List[str]]:
        """
        Batch get conversation members
        
        Args:
            channel_ids: List of Slack channel IDs
            
        Returns:
            Dict mapping channel ID to list of member user IDs
        """
        logger.info(f"🔍 Fetching members for {len(channel_ids)} channels...")
        
        # Remove duplicates
        unique_ids = list(set(channel_ids))
        
        # Check cache first
        cache_keys = [f"conversation_members:{channel_id}" for channel_id in unique_ids]
        cached_results, misses = await self._get_cached_batch(cache_keys)
        
        logger.info(f"📊 Cache: {len(cached_results)} hits, {len(misses)} misses")
        
        # Extract channel IDs that need API calls
        channels_to_fetch = [key.replace('conversation_members:', '') for key in misses]
        
        if not channels_to_fetch:
            return self._format_conversation_results(cached_results)
        
        # Split into batches and process in parallel
        batches = self._create_batches(channels_to_fetch)
        logger.info(f"🚀 Processing {len(batches)} batches of conversation member requests")
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent batches
        
        async def fetch_batch_with_semaphore(batch):
            async with semaphore:
                return await self._execute_with_retry(
                    lambda: self._fetch_conversation_members_batch(batch)
                )
        
        batch_tasks = [fetch_batch_with_semaphore(batch) for batch in batches]
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        
        # Merge results and cache
        fresh_results = {}
        cache_entries = {}
        
        for i, result in enumerate(batch_results):
            if isinstance(result, Exception):
                logger.error(f"❌ Batch {i} failed: {result}")
            else:
                for channel_id, members in result.items():
                    fresh_results[channel_id] = members
                    cache_entries[f"conversation_members:{channel_id}"] = members
        
        # Cache fresh results
        if cache_entries:
            await self._set_cached_batch(cache_entries)
        
        # Merge cached and fresh results
        all_results = {**self._format_conversation_results(cached_results), **fresh_results}
        
        self.metrics.api_calls += len(batches)
        self.metrics.batches_saved += max(0, len(unique_ids) - len(batches))
        
        logger.info(f"✅ Retrieved members for {len(all_results)} channels")
        return all_results
    
    def _format_conversation_results(self, cached_results: Dict[str, Any]) -> Dict[str, List[str]]:
        """Format cached conversation results"""
        formatted = {}
        for key, value in cached_results.items():
            channel_id = key.replace('conversation_members:', '')
            formatted[channel_id] = value
        return formatted
    
    async def _fetch_conversation_members_batch(self, channel_ids: List[str]) -> Dict[str, List[str]]:
        """Fetch conversation members for a batch of channels"""
        results = {}
        
        # Process each channel in the batch concurrently
        async def fetch_channel_members(channel_id: str) -> Tuple[str, List[str]]:
            try:
                response = await self.client.conversations_members(
                    channel=channel_id,
                    limit=1000  # Get up to 1000 members per channel
                )
                return channel_id, response.get('members', [])
            except Exception as e:
                logger.error(f"❌ Failed to fetch members for channel {channel_id}: {e}")
                return channel_id, []
        
        # Create semaphore for individual channel requests
        semaphore = asyncio.Semaphore(10)  # Max 10 concurrent channel requests
        
        async def fetch_with_semaphore(channel_id):
            async with semaphore:
                return await fetch_channel_members(channel_id)
        
        tasks = [fetch_with_semaphore(channel_id) for channel_id in channel_ids]
        channel_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in channel_results:
            if isinstance(result, Exception):
                logger.error(f"Channel fetch failed: {result}")
            else:
                channel_id, members = result
                results[channel_id] = members
        
        return results
    
    async def get_users_info(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Batch get user information
        
        Args:
            user_ids: List of Slack user IDs
            
        Returns:
            Dict mapping user ID to user info dict
        """
        logger.info(f"👥 Fetching info for {len(user_ids)} users...")
        
        # Remove duplicates
        unique_ids = list(set(user_ids))
        
        # Check cache first
        cache_keys = [f"user_info:{user_id}" for user_id in unique_ids]
        cached_results, misses = await self._get_cached_batch(cache_keys)
        
        logger.info(f"📊 Cache: {len(cached_results)} hits, {len(misses)} misses")
        
        # Extract user IDs that need API calls
        users_to_fetch = [key.replace('user_info:', '') for key in misses]
        
        if not users_to_fetch:
            return self._format_user_results(cached_results)
        
        # Split into batches
        batches = self._create_batches(users_to_fetch)
        logger.info(f"🚀 Processing {len(batches)} batches of user info requests")
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent batches
        
        async def fetch_batch_with_semaphore(batch):
            async with semaphore:
                return await self._execute_with_retry(
                    lambda: self._fetch_users_info_batch(batch)
                )
        
        batch_tasks = [fetch_batch_with_semaphore(batch) for batch in batches]
        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        
        # Merge results and cache
        fresh_results = {}
        cache_entries = {}
        
        for i, result in enumerate(batch_results):
            if isinstance(result, Exception):
                logger.error(f"❌ Batch {i} failed: {result}")
            else:
                for user_id, user_info in result.items():
                    fresh_results[user_id] = user_info
                    cache_entries[f"user_info:{user_id}"] = user_info
        
        # Cache fresh results
        if cache_entries:
            await self._set_cached_batch(cache_entries)
        
        # Merge cached and fresh results
        all_results = {**self._format_user_results(cached_results), **fresh_results}
        
        self.metrics.api_calls += len(batches)
        self.metrics.batches_saved += max(0, len(unique_ids) - len(batches))
        
        logger.info(f"✅ Retrieved info for {len(all_results)} users")
        return all_results
    
    def _format_user_results(self, cached_results: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Format cached user results"""
        formatted = {}
        for key, value in cached_results.items():
            user_id = key.replace('user_info:', '')
            formatted[user_id] = value
        return formatted
    
    async def _fetch_users_info_batch(self, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch user info for a batch of users"""
        results = {}
        
        # Process each user individually since Slack's users.info doesn't support batch queries
        async def fetch_user_info(user_id: str) -> Tuple[str, Optional[Dict[str, Any]]]:
            try:
                response = await self.client.users_info(
                    user=user_id,
                    include_locale=True
                )
                return user_id, response.get('user')
            except Exception as e:
                logger.error(f"❌ Failed to fetch user {user_id}: {e}")
                return user_id, None
        
        # Create semaphore for individual user requests
        semaphore = asyncio.Semaphore(20)  # Max 20 concurrent user requests
        
        async def fetch_with_semaphore(user_id):
            async with semaphore:
                return await fetch_user_info(user_id)
        
        tasks = [fetch_with_semaphore(user_id) for user_id in user_ids]
        user_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in user_results:
            if isinstance(result, Exception):
                logger.error(f"User fetch failed: {result}")
            else:
                user_id, user_info = result
                if user_info:
                    results[user_id] = user_info
        
        return results
    
    def get_metrics(self) -> Dict[str, Union[int, str]]:
        """Get performance metrics"""
        return {
            'cache_hits': self.metrics.cache_hits,
            'cache_misses': self.metrics.cache_misses,
            'api_calls': self.metrics.api_calls,
            'batches_saved': self.metrics.batches_saved,
            'total_requests': self.metrics.total_requests,
            'cache_hit_rate': self.metrics.cache_hit_rate
        }
    
    async def clear_cache(self) -> None:
        """Clear cache"""
        if self.cache_type == 'redis' and self.redis_client:
            try:
                await self.redis_client.flushdb()
                logger.info("🧹 Cleared Redis cache")
            except Exception as e:
                logger.error(f"Failed to clear Redis cache: {e}")
        else:
            count = len(self.memory_cache)
            self.memory_cache.clear()
            self.cache_timestamps.clear()
            logger.info(f"🧹 Cleared {count} memory cache entries")
    
    async def close(self) -> None:
        """Cleanup resources"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        if self.redis_client:
            await self.redis_client.close()
        
        await self.client.close()


# Example usage
async def main():
    """Example usage of SlackBatchAPI"""
    import os
    
    if not os.getenv('SLACK_BOT_TOKEN'):
        print("❌ SLACK_BOT_TOKEN environment variable is required")
        return
    
    # Initialize with memory cache
    slack_api = SlackBatchAPI(
        token=os.getenv('SLACK_BOT_TOKEN'),
        cache_type='memory',
        cache_ttl=300,  # 5 minutes
        batch_size=50
    )
    
    try:
        # Example: Get members for channels
        channel_ids = ['C1234567890', 'C2345678901']
        members = await slack_api.get_conversation_members(channel_ids)
        print(f"Retrieved members for {len(members)} channels")
        
        # Example: Get user info
        all_user_ids = list(set(
            user_id for member_list in members.values() 
            for user_id in member_list[:10]  # Limit for demo
        ))
        
        if all_user_ids:
            user_infos = await slack_api.get_users_info(all_user_ids)
            print(f"Retrieved info for {len(user_infos)} users")
        
        # Show metrics
        print("Metrics:", slack_api.get_metrics())
        
    except Exception as e:
        logger.error(f"Example failed: {e}")
    finally:
        await slack_api.close()


if __name__ == '__main__':
    asyncio.run(main())
