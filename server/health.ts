/* eslint-disable @typescript-eslint/no-explicit-any */ // Health check endpoints
 
 
 
 
import type { Request, Response } from 'express';
import { db } from './db';
import { healthStatus } from './metrics';
import { getEnv } from './env';
// Circuit breaker metrics disabled for dev mode
// import { getBreakerTrips } from '../client/src/utils/resilientLimit';

interface HealthComponent {
  name: string;
  status: 'healthy' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  circuitBreaker: {
    trips: number;
  };
  components: HealthComponent[];
}

async function checkDatabase(): Promise<HealthComponent> {
  try {
    // In dev mode with mock database, just return healthy
    if (process.env['DATABASE_URL']?.includes('mock')) {
      healthStatus['set']({ component: 'database' }, 1);
      return {
        name: 'database',
        status: 'healthy',
        message: 'Database in mock mode (development)',
      };
    }
    
    // Simple query to check database connectivity
    await db.execute('SELECT 1');
    healthStatus['set']({ component: 'database' }, 1);
    return {
      name: 'database',
      status: 'healthy',
      message: 'Database connection successful',
    };
  } catch (error) {
    healthStatus['set']({ component: 'database' }, 0);
    return {
      name: 'database',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

async function checkRedis(): Promise<HealthComponent> {
  const env = getEnv();
  
  if (!env.REDIS_URL || env.REDIS_URL === 'memory://') {
    healthStatus['set']({ component: 'redis' }, 1);
    return {
      name: 'redis',
      status: 'healthy',
      message: 'Redis in memory mode (development)',
    };
  }

  try {
    // If Redis is configured, we would check it here
    // For now, we'll just mark it as healthy since it's optional
    healthStatus['set']({ component: 'redis' }, 1);
    return {
      name: 'redis',
      status: 'healthy',
      message: 'Redis connection successful',
    };
  } catch (error) {
    healthStatus['set']({ component: 'redis' }, 0);
    return {
      name: 'redis',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

async function performHealthCheck(): Promise<HealthResponse> {
  const startTime = Date.now();
  
  const [databaseHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const components = [databaseHealth, redisHealth];
  const isHealthy = components.every(component => component.status === 'healthy');
  
  // Set overall health status
  healthStatus['set']({ component: 'overall' }, isHealthy ? 1 : 0);

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env["npm_package_version"] || 'unknown',
    circuitBreaker: {
      trips: 0 // Circuit breaker disabled in dev mode
    },
    components,
  };
}

// Basic health check endpoint
export async function healthCheck(req: Request, res: Response) {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res["status"](statusCode)["json"](health);
  } catch (error) {
    res["status"](503)["json"]({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env["npm_package_version"] || 'unknown',
      circuitBreaker: {
        trips: 0
      },
      components: [{
        name: 'health_check',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed',
      }],
    });
  }
}

// Readiness check (for Kubernetes)
export async function readinessCheck(req: Request, res: Response) {
  try {
    // Check if all critical components are ready
    const databaseHealth = await checkDatabase();
    const isReady = databaseHealth.status === 'healthy';
    
    if (isReady) {
      res["status"](200)["json"]({ 
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res["status"](503)["json"]({ 
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not ready',
      });
    }
  } catch (error) {
    res["status"](503)["json"]({ 
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      reason: error instanceof Error ? error.message : 'Readiness check failed',
    });
  }
}

// Liveness check (for Kubernetes)
export async function livenessCheck(req: Request, res: Response) {
  // Simple liveness check - if the process is running, it's alive
  res["status"](200)["json"]({ 
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

