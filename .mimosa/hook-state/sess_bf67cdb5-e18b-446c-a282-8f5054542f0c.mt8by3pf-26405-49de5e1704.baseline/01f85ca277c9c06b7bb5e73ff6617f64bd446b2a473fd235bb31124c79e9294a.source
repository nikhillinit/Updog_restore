/**
 * Test Upstash Redis connection
 * Usage: REDIS_URL="rediss://..." npx tsx scripts/test-redis-upstash.ts
 */
import { createClient } from 'redis';

async function testUpstashRedis() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl || redisUrl === 'memory://') {
    console.error('❌ Please set REDIS_URL environment variable');
    console.log('Example: REDIS_URL="rediss://default:password@endpoint.upstash.io:6379" npx tsx scripts/test-redis-upstash.ts');
    process.exit(1);
  }

  console.log('🔄 Connecting to Upstash Redis...');
  console.log(`   URL: ${redisUrl.replace(/:([^:@]+)@/, ':****@')}`); // Hide password

  const client = createClient({
    url: redisUrl,
    socket: {
      tls: true,
      reconnectStrategy: (retries: number) => {
        if (retries > 3) return new Error('Max retries reached');
        return Math.min(retries * 100, 3000);
      },
      connectTimeout: 10000,
    }
  });

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');

    // Test basic operations
    console.log('\n📝 Testing basic operations:');
    
    // SET
    await client.set('test:key', 'Hello from Upstash!');
    console.log('✅ SET test:key');
    
    // GET
    const value = await client.get('test:key');
    console.log(`✅ GET test:key = "${value}"`);
    
    // PING
    const pong = await client.ping();
    console.log(`✅ PING = ${pong}`);
    
    // INFO
    const info = await client.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    console.log(`✅ Redis version: ${version || 'unknown'}`);
    
    // Cleanup
    await client.del('test:key');
    console.log('✅ Cleanup completed');
    
    // Test hash operations (for idempotency)
    await client.hSet('test:hash', 'field1', 'value1');
    const hashValue = await client.hGet('test:hash', 'field1');
    console.log(`✅ Hash operations work: ${hashValue}`);
    await client.del('test:hash');

    console.log('\n🎉 All tests passed! Your Upstash Redis is working correctly.');
    console.log('\n📋 Use this REDIS_URL in your GitHub secrets as STAGING_REDIS_URL');
    
    await client.quit();
  } catch (error) {
    console.error('❌ Connection failed:', error);
    console.log('\n🔍 Troubleshooting tips:');
    console.log('1. Check your Redis URL format: rediss://default:password@endpoint.upstash.io:6379');
    console.log('2. Make sure the password is correct (no extra spaces)');
    console.log('3. Verify the endpoint is correct');
    console.log('4. Ensure your Upstash database is active');
    process.exit(1);
  }
}

testUpstashRedis();