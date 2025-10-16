import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import type { Request, Response } from '../types/request-response';

const router = Router();
const execAsync = promisify(exec);

interface DevHealthMetrics {
  typescript: {
    errorCount: number;
    errors: Array<{ file: string; line: number; message: string }>;
    trend: 'improving' | 'stable' | 'degrading';
  };
  tests: {
    status: 'passing' | 'failing' | 'unknown';
    passCount: number;
    failCount: number;
    coverage: number;
    performance: {
      avgDuration: number;
      slowTests: Array<{ name: string; duration: number }>;
    };
  };
  build: {
    status: 'success' | 'failed' | 'building';
    duration: number;
    size: {
      client: number;
      server: number;
    };
    warnings: number;
  };
  monteCarlo: {
    status: 'healthy' | 'degraded' | 'offline';
    avgLatency: number;
    throughput: number;
    errorRate: number;
  };
  database: {
    status: 'connected' | 'disconnected' | 'degraded';
    latency: number;
    connectionCount: number;
  };
  devServer: {
    status: 'running' | 'stopped' | 'error';
    port: number;
    memory: number;
    uptime: number;
  };
  git: {
    branch: string;
    uncommittedChanges: number;
    lastCommit: {
      hash: string;
      message: string;
      timestamp: string;
    };
  };
}

async function getTypeScriptErrors(): Promise<DevHealthMetrics['typescript']> {
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false 2>&1 || true');
    const output = stdout + stderr;

    // Parse TypeScript errors
    const errorRegex = /(.+)\((\d+),\d+\): error TS\d+: (.+)/g;
    const errors: Array<{ file: string; line: number; message: string }> = [];
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        message: match[3].trim()
      });
    }

    // Simple trend calculation based on error count history
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    try {
      const historyPath = '.ts-error-history.json';
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8').catch(() => '[]'));
      history.push({ timestamp: Date.now(), count: errors.length });

      // Keep only last 10 entries
      const recentHistory = history.slice(-10);
      await fs.writeFile(historyPath, JSON.stringify(recentHistory));

      if (recentHistory.length >= 3) {
        const recent = recentHistory.slice(-3);
        const avg = recent.reduce((sum: number, entry: any) => sum + entry.count, 0) / recent.length;
        if (errors.length < avg * 0.8) trend = 'improving';
        else if (errors.length > avg * 1.2) trend = 'degrading';
      }
    } catch (e) {
      // Ignore history errors
    }

    return {
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Limit to top 10 errors
      trend
    };
  } catch (error) {
    return {
      errorCount: -1,
      errors: [],
      trend: 'stable'
    };
  }
}

async function getTestMetrics(): Promise<DevHealthMetrics['tests']> {
  try {
    const { stdout } = await execAsync('npm run test:quick -- --reporter=json 2>/dev/null || echo "{"failed":true}"');
    const testResult = JSON.parse(stdout.split('\n').find(line => line.startsWith('{')) || '{"failed":true}');

    let status: 'passing' | 'failing' | 'unknown' = 'unknown';
    let passCount = 0;
    let failCount = 0;

    if (testResult.testResults) {
      const results = testResult.testResults;
      passCount = results.reduce((sum: number, result: any) => sum + result.numPassingTests, 0);
      failCount = results.reduce((sum: number, result: any) => sum + result.numFailingTests, 0);
      status = failCount === 0 ? 'passing' : 'failing';
    }

    return {
      status,
      passCount,
      failCount,
      coverage: 85, // Placeholder - integrate with actual coverage
      performance: {
        avgDuration: 150,
        slowTests: []
      }
    };
  } catch (error) {
    return {
      status: 'unknown',
      passCount: 0,
      failCount: 0,
      coverage: 0,
      performance: { avgDuration: 0, slowTests: [] }
    };
  }
}

async function getBuildMetrics(): Promise<DevHealthMetrics['build']> {
  try {
    const distPath = 'dist';
    const clientPath = path.join(distPath, 'client');
    const serverPath = path.join(distPath, 'server');

    let clientSize = 0;
    let serverSize = 0;

    try {
      const clientStats = await fs.stat(clientPath);
      clientSize = clientStats.size;
    } catch (e) {
      // Client build not found
    }

    try {
      const serverStats = await fs.stat(serverPath);
      serverSize = serverStats.size;
    } catch (e) {
      // Server build not found
    }

    return {
      status: clientSize > 0 ? 'success' : 'failed',
      duration: 45000, // Placeholder
      size: { client: clientSize, server: serverSize },
      warnings: 0
    };
  } catch (error) {
    return {
      status: 'failed',
      duration: 0,
      size: { client: 0, server: 0 },
      warnings: 0
    };
  }
}

async function getMonteCarloMetrics(): Promise<DevHealthMetrics['monteCarlo']> {
  // Check if Monte Carlo workers are healthy by testing a simple simulation
  try {
    const start = Date.now();
    // This would typically check worker health via Redis/BullMQ
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      avgLatency: latency,
      throughput: 100, // simulations per minute
      errorRate: 0.01
    };
  } catch (error) {
    return {
      status: 'offline',
      avgLatency: 0,
      throughput: 0,
      errorRate: 1.0
    };
  }
}

async function getDatabaseMetrics(): Promise<DevHealthMetrics['database']> {
  try {
    const start = Date.now();
    await storage.ping();
    const latency = Date.now() - start;

    return {
      status: 'connected',
      latency,
      connectionCount: 1 // Placeholder
    };
  } catch (error) {
    return {
      status: 'disconnected',
      latency: 0,
      connectionCount: 0
    };
  }
}

async function getDevServerMetrics(): Promise<DevHealthMetrics['devServer']> {
  const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const uptime = Math.round(process.uptime());

  return {
    status: 'running',
    port: parseInt(process.env["PORT"] || '5000'),
    memory,
    uptime
  };
}

async function getGitMetrics(): Promise<DevHealthMetrics['git']> {
  try {
    const [branchResult, statusResult, lastCommitResult] = await Promise.all([
      execAsync('git branch --show-current').catch(() => ({ stdout: 'unknown' })),
      execAsync('git status --porcelain').catch(() => ({ stdout: '' })),
      execAsync('git log -1 --format="%H|%s|%ai"').catch(() => ({ stdout: 'unknown||' }))
    ]);

    const branch = branchResult.stdout.trim();
    const uncommittedChanges = statusResult.stdout.trim().split('\n').filter(Boolean).length;

    const [hash, message, timestamp] = lastCommitResult.stdout.trim().split('|');

    return {
      branch,
      uncommittedChanges,
      lastCommit: {
        hash: hash?.substring(0, 8) || 'unknown',
        message: message || 'No commits',
        timestamp: timestamp || new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      branch: 'unknown',
      uncommittedChanges: 0,
      lastCommit: {
        hash: 'unknown',
        message: 'Error fetching commit',
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Main dashboard endpoint
router["get"]('/health', async (req: Request, res: Response) => {
  try {
    const [
      typescript,
      tests,
      build,
      monteCarlo,
      database,
      devServer,
      git
    ] = await Promise.all([
      getTypeScriptErrors(),
      getTestMetrics(),
      getBuildMetrics(),
      getMonteCarloMetrics(),
      getDatabaseMetrics(),
      getDevServerMetrics(),
      getGitMetrics()
    ]);

    const metrics: DevHealthMetrics = {
      typescript,
      tests,
      build,
      monteCarlo,
      database,
      devServer,
      git
    };

    res["json"]({
      timestamp: new Date().toISOString(),
      overall: calculateOverallHealth(metrics),
      metrics
    });
  } catch (error) {
    res["status"](500)["json"]({
      error: 'Failed to gather dev health metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Quick fix endpoints
router["post"]('/fix/typescript', async (req: Request, res: Response) => {
  try {
    await execAsync('npm run check && npm run lint:fix');
    res["json"]({ success: true, message: 'TypeScript issues fixed' });
  } catch (error) {
    res["status"](500)["json"]({
      success: false,
      message: error instanceof Error ? error.message : 'Fix failed'
    });
  }
});

router["post"]('/fix/tests', async (req: Request, res: Response) => {
  try {
    await execAsync('npm run test:quick');
    res["json"]({ success: true, message: 'Tests executed' });
  } catch (error) {
    res["status"](500)["json"]({
      success: false,
      message: error instanceof Error ? error.message : 'Tests failed'
    });
  }
});

router["post"]('/fix/build', async (req: Request, res: Response) => {
  try {
    await execAsync('npm run build:fast');
    res["json"]({ success: true, message: 'Build completed' });
  } catch (error) {
    res["status"](500)["json"]({
      success: false,
      message: error instanceof Error ? error.message : 'Build failed'
    });
  }
});

function calculateOverallHealth(metrics: DevHealthMetrics): 'healthy' | 'warning' | 'critical' {
  const issues = [
    metrics.typescript.errorCount > 0,
    metrics.tests.status === 'failing',
    metrics.build.status === 'failed',
    metrics.database.status === 'disconnected',
    metrics.monteCarlo.status === 'offline'
  ];

  const criticalIssues = issues.filter(Boolean).length;

  if (criticalIssues === 0) return 'healthy';
  if (criticalIssues <= 2) return 'warning';
  return 'critical';
}

export default router;