/**
 * Distributed tracing utilities for deployment and operational monitoring
 */

export interface TraceSpan {
  id: string;
  parentId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{
    timestamp: number;
    message: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    fields?: Record<string, unknown>;
  }>;
  status: 'active' | 'completed' | 'failed';
}

class TracingService {
  private spans = new Map<string, TraceSpan>();
  private activeSpans = new Set<string>();

  generateSpanId(): string {
    return crypto.randomUUID();
  }

  startSpan(
    operationName: string,
    parentId?: string,
    tags: Record<string, unknown> = {}
  ): TraceSpan {
    const span: TraceSpan = {
      id: this.generateSpanId(),
      ...(parentId && { parentId }),
      operationName,
      startTime: Date.now(),
      tags: this.sanitizeTags(tags),
      logs: [],
      status: 'active',
    };

    this.spans['set'](span.id, span);
    this.activeSpans.add(span.id);

    this.log(span.id, 'info', `Started ${operationName}`, { spanId: span.id, parentId });

    return span;
  }

  finishSpan(
    spanId: string,
    status: 'completed' | 'failed' = 'completed',
    finalTags: Record<string, unknown> = {}
  ) {
    const span = this.spans['get'](spanId);
    if (!span) {
      console.warn(`Attempted to finish unknown span: ${spanId}`);
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    // Add final tags
    Object.assign(span.tags, this.sanitizeTags(finalTags));

    this.activeSpans.delete(spanId);
    this.log(spanId, 'info', `Finished ${span.operationName}`, {
      duration: span.duration,
      status,
    });

    return span;
  }

  log(
    spanId: string,
    level: TraceSpan['logs'][0]['level'],
    message: string,
    fields?: Record<string, unknown>
  ) {
    const span = this.spans['get'](spanId);
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      message,
      level,
      ...(fields && { fields }),
    });

    // Also log to console for immediate visibility
    const logMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[${span.operationName}:${spanId.slice(0, 8)}] ${message}`, fields || '');
  }

  addTags(spanId: string, tags: Record<string, unknown>) {
    const span = this.spans['get'](spanId);
    if (!span) return;

    Object.assign(span.tags, this.sanitizeTags(tags));
  }

  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans['get'](spanId);
  }

  getActiveSpans(): TraceSpan[] {
    return Array.from(this.activeSpans)
      .map((id) => this.spans['get'](id)!)
      .filter(Boolean);
  }

  getAllSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  // Get trace tree for a root span
  getTrace(rootSpanId: string): TraceSpan[] {
    const trace: TraceSpan[] = [];
    const visited = new Set<string>();

    const collectSpans = (spanId: string) => {
      if (visited.has(spanId)) return;
      visited.add(spanId);

      const span = this.spans['get'](spanId);
      if (!span) return;

      trace.push(span);

      // Find children
      for (const [id, childSpan] of this.spans) {
        if (childSpan.parentId === spanId) {
          collectSpans(id);
        }
      }
    };

    collectSpans(rootSpanId);
    return trace.sort((a: TraceSpan, b: TraceSpan) => a.startTime - b.startTime);
  }

  // Export trace data in OpenTelemetry format
  exportTrace(rootSpanId: string) {
    const trace = this.getTrace(rootSpanId);
    const rootSpan = trace.find((s) => s.id === rootSpanId);

    return {
      traceId: rootSpanId,
      spans: trace.map((span) => ({
        spanId: span.id,
        parentSpanId: span.parentId,
        operationName: span.operationName,
        startTime: span.startTime,
        endTime: span.endTime,
        duration: span.duration,
        tags: span.tags,
        logs: span.logs,
        status: span.status,
      })),
      duration: rootSpan ? (rootSpan.endTime || Date.now()) - rootSpan.startTime : 0,
      startTime: rootSpan?.startTime || Date.now(),
    };
  }

  // Clean up completed spans older than retention period
  cleanup(retentionMs: number = 24 * 60 * 60 * 1000) {
    // 24 hours default
    const cutoff = Date.now() - retentionMs;
    let cleaned = 0;

    for (const [id, span] of this.spans) {
      if (span.status !== 'active' && span.startTime < cutoff) {
        this.spans.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old trace spans`);
    }
  }

  private sanitizeTags(tags: Record<string, unknown>): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(tags)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (value !== null && value !== undefined) {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }
}

// Global tracing instance
export const tracer = new TracingService();

// Deployment-specific tracing helpers
export class DeploymentTracer {
  private rootSpanId: string;

  constructor(deploymentId: string, version: string) {
    this.rootSpanId = tracer.startSpan('deployment', undefined, {
      deploymentId,
      version,
      component: 'deployment-orchestrator',
    }).id;
  }

  startStage(stageName: string, percentage: number, duration: number) {
    return tracer.startSpan(`deployment.stage.${stageName}`, this.rootSpanId, {
      stage: stageName,
      percentage,
      plannedDuration: duration,
      phase: 'deployment',
    });
  }

  startPreflight() {
    return tracer.startSpan('deployment.preflight', this.rootSpanId, {
      phase: 'preflight',
    });
  }

  startHealthCheck(target: string, checkType: string) {
    return tracer.startSpan('deployment.health_check', this.rootSpanId, {
      target,
      checkType,
      phase: 'monitoring',
    });
  }

  startRollback(reason: string) {
    return tracer.startSpan('deployment.rollback', this.rootSpanId, {
      reason,
      phase: 'rollback',
    });
  }

  finishDeployment(status: 'success' | 'failed', metadata: Record<string, unknown> = {}) {
    tracer.finishSpan(this.rootSpanId, status === 'success' ? 'completed' : 'failed', {
      deploymentStatus: status,
      ...metadata,
    });
  }

  exportTrace() {
    return tracer.exportTrace(this.rootSpanId);
  }

  getRootSpanId() {
    return this.rootSpanId;
  }
}

// Auto-cleanup every hour
setInterval(
  () => {
    tracer.cleanup();
  },
  60 * 60 * 1000
);
