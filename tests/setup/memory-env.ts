// tests/setup/memory-env.ts
// Enforce memory mode in tests.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.REDIS_URL = 'memory://';
process.env.ENABLE_QUEUES = '0';
process.env.ENABLE_SESSIONS = process.env.ENABLE_SESSIONS || '0';
process.env.ENABLE_METRICS = process.env.ENABLE_METRICS || '0';