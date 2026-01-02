import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DevMetricsUpdate {
  type: 'metrics_update';
  data: {
    timestamp: string;
    overall: 'healthy' | 'warning' | 'critical';
    changedMetrics: string[];
    metrics: any;
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
  private fileWatcher: any = null;
  private lastMetrics: any = null;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env["NODE_ENV"] === 'development' ? '*' : false,
        methods: ['GET', 'POST']
      },
      path: '/socket.io/dev-dashboard'
    });

    this.setupEventHandlers();
    this.startPeriodicUpdates();
    this.setupFileWatchers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Dev dashboard client connected:', socket.id);

      // Send initial metrics on connection
      this.sendMetricsUpdate(socket);

      socket.on('request_metrics', () => {
        this.sendMetricsUpdate(socket);
      });

      socket.on('trigger_build', async () => {
        try {
          this.broadcast({
            type: 'build_started',
            data: { timestamp: new Date().toISOString() }
          });

          const start = Date.now();
          await execAsync('npm run build:fast');
          const duration = Date.now() - start;

          this.broadcast({
            type: 'build_completed',
            data: {
              timestamp: new Date().toISOString(),
              duration
            }
          });

          // Trigger metrics update after build
          setTimeout(() => this.broadcastMetricsUpdate(), 1000);
        } catch (error) {
          this.broadcast({
            type: 'build_failed',
            data: {
              timestamp: new Date().toISOString(),
              errors: [error instanceof Error ? error.message : 'Build failed']
            }
          });
        }
      });

      socket.on('trigger_tests', async () => {
        try {
          this.broadcast({
            type: 'test_started',
            data: { timestamp: new Date().toISOString() }
          });

          const { stdout } = await execAsync('npm run test:quick -- --reporter=json');
          const testResult = JSON.parse(stdout.split('\n').find(line => line.startsWith('{')) || '{}');

          const results = {
            passed: testResult.numPassedTests || 0,
            failed: testResult.numFailedTests || 0,
            coverage: 85 // Placeholder
          };

          this.broadcast({
            type: 'test_completed',
            data: {
              timestamp: new Date().toISOString(),
              results
            }
          });

          // Trigger metrics update after tests
          setTimeout(() => this.broadcastMetricsUpdate(), 1000);
        } catch (error) {
          this.broadcast({
            type: 'test_failed',
            data: {
              timestamp: new Date().toISOString()
            }
          });
        }
      });

      socket.on('disconnect', () => {
        console.log('Dev dashboard client disconnected:', socket.id);
      });
    });
  }

  private async sendMetricsUpdate(socket: any) {
    try {
      const metrics = await this.collectMetrics();
      const event: DevMetricsUpdate = {
        type: 'metrics_update',
        data: {
          timestamp: new Date().toISOString(),
          overall: this.calculateOverallHealth(metrics),
          changedMetrics: this.getChangedMetrics(metrics),
          metrics
        }
      };

      socket.emit('dev_dashboard_event', event);
      this.lastMetrics = metrics;
    } catch (error) {
      console.error('Failed to send metrics update:', error);
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
          metrics
        }
      };

      this.broadcast(event);
      this.lastMetrics = metrics;
    } catch (error) {
      console.error('Failed to broadcast metrics update:', error);
    }
  }

  private broadcast(event: DevDashboardEvent) {
    this.io.emit('dev_dashboard_event', event);
  }

  private async collectMetrics() {
    // Simplified metrics collection for real-time updates
    // This mirrors the logic from the dev-dashboard route but optimized for frequent polling

    const [typescript, git] = await Promise.all([
      this.getTypeScriptErrors(),
      this.getGitStatus()
    ]);

    return {
      typescript,
      git,
      devServer: {
        status: 'running',
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: Math.round(process.uptime())
      }
    };
  }

  private async getTypeScriptErrors() {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false 2>&1 || true');
      const output = stdout + stderr;
      const errorRegex = /(.+)\((\d+),\d+\): error TS\d+: (.+)/g;
      const errors = [];
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        errors.push({
          file: match[1] ?? '',
          line: parseInt(match[2] ?? '0'),
          message: (match[3] ?? '').trim()
        });
      }

      return {
        errorCount: errors.length,
        errors: errors.slice(0, 5),
        trend: 'stable'
      };
    } catch (error) {
      return { errorCount: -1, errors: [], trend: 'stable' };
    }
  }

  private async getGitStatus() {
    try {
      const [statusResult] = await Promise.all([
        execAsync('git status --porcelain').catch(() => ({ stdout: '' }))
      ]);

      const uncommittedChanges = statusResult.stdout.trim().split('\n').filter(Boolean).length;

      return {
        uncommittedChanges
      };
    } catch (error) {
      return { uncommittedChanges: 0 };
    }
  }

  private getChangedMetrics(newMetrics: any): string[] {
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

  private calculateOverallHealth(metrics: any): 'healthy' | 'warning' | 'critical' {
    const issues = [
      metrics.typescript?.errorCount > 0
    ];

    const criticalIssues = issues.filter(Boolean).length;

    if (criticalIssues === 0) return 'healthy';
    if (criticalIssues <= 1) return 'warning';
    return 'critical';
  }

  private startPeriodicUpdates() {
    // Update metrics every 15 seconds for connected clients
    this.metricsInterval = setInterval(() => {
      if (this.io.engine.clientsCount > 0) {
        this.broadcastMetricsUpdate();
      }
    }, 15000);
  }

  private setupFileWatchers() {
    // Watch for TypeScript file changes to trigger immediate updates
    try {
      const chokidar = require('chokidar');
      this.fileWatcher = chokidar.watch([
        'client/src/**/*.{ts,tsx}',
        'server/**/*.ts',
        'shared/**/*.ts'
      ], {
        ignored: /node_modules/,
        persistent: true,
        ignoreInitial: true
      });

      let updateTimeout: NodeJS.Timeout;
      this.fileWatcher.on('change', () => {
        // Debounce file changes
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          this.broadcastMetricsUpdate();
        }, 2000);
      });
    } catch (error) {
      console.warn('File watcher setup failed (chokidar not installed):', error instanceof Error ? error.message : String(error));
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