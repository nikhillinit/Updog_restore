import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { exec } from 'child_process';
import { createRequire } from 'module';
import { promisify } from 'util';
import { logger } from '../logger';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

interface TypeScriptErrorMetric {
  file: string;
  line: number;
  message: string;
}

interface TypeScriptMetrics {
  errorCount: number;
  errors: TypeScriptErrorMetric[];
  trend: 'stable';
}

interface GitMetrics {
  uncommittedChanges: number;
}

interface DevServerMetrics {
  status: 'running';
  memory: number;
  uptime: number;
}

interface CollectedMetrics {
  typescript: TypeScriptMetrics;
  git: GitMetrics;
  devServer: DevServerMetrics;
}

interface FileWatcher {
  on(event: 'change', listener: () => void): FileWatcher;
  close(): void;
}

interface ChokidarModule {
  watch(
    paths: string[],
    options: { ignored: RegExp; persistent: boolean; ignoreInitial: boolean }
  ): FileWatcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isChokidarModule(value: unknown): value is ChokidarModule {
  return isRecord(value) && typeof value['watch'] === 'function';
}

function parseQuickTestSummary(raw: string): { passed: number; failed: number } {
  const jsonLine = raw.split('\n').find((line) => line.startsWith('{'));
  if (!jsonLine) {
    return { passed: 0, failed: 0 };
  }

  try {
    const parsed: unknown = JSON.parse(jsonLine);
    if (!isRecord(parsed)) {
      return { passed: 0, failed: 0 };
    }

    return {
      passed: typeof parsed['numPassedTests'] === 'number' ? parsed['numPassedTests'] : 0,
      failed: typeof parsed['numFailedTests'] === 'number' ? parsed['numFailedTests'] : 0,
    };
  } catch {
    return { passed: 0, failed: 0 };
  }
}

interface DevMetricsUpdate {
  type: 'metrics_update';
  data: {
    timestamp: string;
    overall: 'healthy' | 'warning' | 'critical';
    changedMetrics: string[];
    metrics: CollectedMetrics;
  };
}

interface BuildEvent {
  type: 'build_started' | 'build_completed' | 'build_failed';
  data: {
    timestamp: string;
    duration?: number;
    errors?: string[];
  };
}

interface TestEvent {
  type: 'test_started' | 'test_completed' | 'test_failed';
  data: {
    timestamp: string;
    results?: {
      passed: number;
      failed: number;
      coverage: number;
    };
  };
}

type DevDashboardEvent = DevMetricsUpdate | BuildEvent | TestEvent;

class DevDashboardWebSocket {
  private io: SocketIOServer;
  private metricsInterval: NodeJS.Timeout | null = null;
  private fileWatcher: FileWatcher | null = null;
  private lastMetrics: CollectedMetrics | null = null;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env['NODE_ENV'] === 'development' ? '*' : false,
        methods: ['GET', 'POST'],
      },
      path: '/socket.io/dev-dashboard',
    });

    this.setupEventHandlers();
    this.startPeriodicUpdates();
    this.setupFileWatchers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Dev dashboard client connected', { socketId: socket.id });

      // Send initial metrics on connection
      this.sendMetricsUpdate(socket);

      socket.on('request_metrics', () => {
        this.sendMetricsUpdate(socket);
      });

      socket.on('trigger_build', async () => {
        try {
          this.broadcast({
            type: 'build_started',
            data: { timestamp: new Date().toISOString() },
          });

          const start = Date.now();
          await execAsync('npm run build:fast');
          const duration = Date.now() - start;

          this.broadcast({
            type: 'build_completed',
            data: {
              timestamp: new Date().toISOString(),
              duration,
            },
          });

          // Trigger metrics update after build
          setTimeout(() => {
            void this.broadcastMetricsUpdate();
          }, 1000);
        } catch (error) {
          this.broadcast({
            type: 'build_failed',
            data: {
              timestamp: new Date().toISOString(),
              errors: [error instanceof Error ? error.message : 'Build failed'],
            },
          });
        }
      });

      socket.on('trigger_tests', async () => {
        try {
          this.broadcast({
            type: 'test_started',
            data: { timestamp: new Date().toISOString() },
          });

          const { stdout } = await execAsync('npm run test:quick -- --reporter=json');
          const testResult = parseQuickTestSummary(stdout);

          const results = {
            passed: testResult.passed,
            failed: testResult.failed,
            coverage: 85, // Placeholder
          };

          this.broadcast({
            type: 'test_completed',
            data: {
              timestamp: new Date().toISOString(),
              results,
            },
          });

          // Trigger metrics update after tests
          setTimeout(() => {
            void this.broadcastMetricsUpdate();
          }, 1000);
        } catch {
          this.broadcast({
            type: 'test_failed',
            data: {
              timestamp: new Date().toISOString(),
            },
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info('Dev dashboard client disconnected', { socketId: socket.id });
      });
    });
  }

  private async sendMetricsUpdate(socket: Socket) {
    try {
      const metrics = await this.collectMetrics();
      const event: DevMetricsUpdate = {
        type: 'metrics_update',
        data: {
          timestamp: new Date().toISOString(),
          overall: this.calculateOverallHealth(metrics),
          changedMetrics: this.getChangedMetrics(metrics),
          metrics,
        },
      };

      socket.emit('dev_dashboard_event', event);
      this.lastMetrics = metrics;
    } catch (error) {
      logger.error('Failed to send metrics update', { error });
    }
  }

  private async broadcastMetricsUpdate() {
    try {
      const metrics = await this.collectMetrics();
      const event: DevMetricsUpdate = {
        type: 'metrics_update',
        data: {
          timestamp: new Date().toISOString(),
          overall: this.calculateOverallHealth(metrics),
          changedMetrics: this.getChangedMetrics(metrics),
          metrics,
        },
      };

      this.broadcast(event);
      this.lastMetrics = metrics;
    } catch (error) {
      logger.error('Failed to broadcast metrics update', { error });
    }
  }

  private broadcast(event: DevDashboardEvent) {
    this.io.emit('dev_dashboard_event', event);
  }

  private async collectMetrics(): Promise<CollectedMetrics> {
    // Simplified metrics collection for real-time updates
    // This mirrors the logic from the dev-dashboard route but optimized for frequent polling

    const [typescript, git] = await Promise.all([this.getTypeScriptErrors(), this.getGitStatus()]);

    return {
      typescript,
      git,
      devServer: {
        status: 'running',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: Math.round(process.uptime()),
      },
    };
  }

  private async getTypeScriptErrors(): Promise<TypeScriptMetrics> {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false 2>&1 || true');
      const output = stdout + stderr;
      const errorRegex = /(.+)\((\d+),\d+\): error TS\d+: (.+)/g;
      const errors: TypeScriptErrorMetric[] = [];
      let match: RegExpExecArray | null;

      while ((match = errorRegex.exec(output)) !== null) {
        errors.push({
          file: match[1] ?? '',
          line: parseInt(match[2] ?? '0'),
          message: (match[3] ?? '').trim(),
        });
      }

      return {
        errorCount: errors.length,
        errors: errors.slice(0, 5),
        trend: 'stable',
      };
    } catch {
      return { errorCount: -1, errors: [], trend: 'stable' };
    }
  }

  private async getGitStatus(): Promise<GitMetrics> {
    try {
      const [statusResult] = await Promise.all([
        execAsync('git status --porcelain').catch(() => ({ stdout: '' })),
      ]);

      const uncommittedChanges = statusResult.stdout.trim().split('\n').filter(Boolean).length;

      return {
        uncommittedChanges,
      };
    } catch {
      return { uncommittedChanges: 0 };
    }
  }

  private getChangedMetrics(newMetrics: CollectedMetrics): string[] {
    if (!this.lastMetrics) return [];

    const changes: string[] = [];

    // Check TypeScript errors
    if (this.lastMetrics.typescript?.errorCount !== newMetrics.typescript?.errorCount) {
      changes.push('typescript');
    }

    // Check Git changes
    if (this.lastMetrics.git?.uncommittedChanges !== newMetrics.git?.uncommittedChanges) {
      changes.push('git');
    }

    return changes;
  }

  private calculateOverallHealth(metrics: CollectedMetrics): 'healthy' | 'warning' | 'critical' {
    const issues = [metrics.typescript?.errorCount > 0];

    const criticalIssues = issues.filter(Boolean).length;

    if (criticalIssues === 0) return 'healthy';
    if (criticalIssues <= 1) return 'warning';
    return 'critical';
  }

  private startPeriodicUpdates() {
    // Update metrics every 15 seconds for connected clients
    this.metricsInterval = setInterval(() => {
      if (this.io.engine.clientsCount > 0) {
        void this.broadcastMetricsUpdate();
      }
    }, 15000);
  }

  private setupFileWatchers() {
    // Watch for TypeScript file changes to trigger immediate updates
    try {
      const chokidarModule: unknown = require('chokidar');
      if (!isChokidarModule(chokidarModule)) {
        throw new Error('Invalid chokidar module shape');
      }

      this.fileWatcher = chokidarModule.watch(
        ['client/src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts'],
        {
          ignored: /node_modules/,
          persistent: true,
          ignoreInitial: true,
        }
      );

      let updateTimeout: NodeJS.Timeout;
      this.fileWatcher.on('change', () => {
        // Debounce file changes
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          void this.broadcastMetricsUpdate();
        }, 2000);
      });
    } catch (error) {
      logger.warn('File watcher setup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public cleanup() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
    this.io.close();
  }
}

export default DevDashboardWebSocket;
