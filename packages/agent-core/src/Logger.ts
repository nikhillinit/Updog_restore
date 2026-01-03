import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level: LogLevel;
  agent: string;
  logDir?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  agent: string;
  message: string;
  data?: unknown;
  error?: string;
  stack?: string;
}

export class Logger {
  private readonly config: Required<LoggerConfig>;
  private readonly logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(config: LoggerConfig) {
    this.config = {
      logDir: join(process.cwd(), 'ai-logs'),
      enableConsole: true,
      enableFile: true,
      ...config,
    };

    this.ensureLogDirectory();
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | unknown): void {
    const errorData = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error;

    this.log('error', message, errorData);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.logLevels[level] < this.logLevels[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      agent: this.config.agent,
      message,
      data,
    };

    if (data instanceof Error) {
      entry.error = data.message;
      const stack = data.stack;
      if (stack !== undefined) {
        entry.stack = stack;
      }
      entry.data = undefined;
    }

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    if (this.config.enableFile) {
      this.logToFile(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.substring(11, 19); // HH:MM:SS
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.agent}]`;
    
    const message = entry.data 
      ? `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`
      : `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.log(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        if (entry.stack) console.error(entry.stack);
        break;
    }
  }

  private logToFile(entry: LogEntry): void {
    try {
      const logFile = join(this.config.logDir, `${this.config.agent}.log`);
      const jsonEntry = `${JSON.stringify(entry)  }\n`;
      
      if (existsSync(logFile)) {
        appendFileSync(logFile, jsonEntry);
      } else {
        writeFileSync(logFile, jsonEntry);
      }
    } catch (error: unknown) {
      console.error('Failed to write to log file:', error);
    }
  }

  private ensureLogDirectory(): void {
    try {
      if (!existsSync(this.config.logDir)) {
        mkdirSync(this.config.logDir, { recursive: true });
      }
    } catch (error: unknown) {
      console.warn('Failed to create log directory:', error);
      // Disable file logging if directory creation fails
      this.config.enableFile = false;
    }
  }

  /**
   * Create a structured log entry for agent operations
   */
  logAgentOperation(
    operation: string,
    status: 'start' | 'success' | 'error',
    data?: unknown,
    error?: Error
  ): void {
    const operationData = {
      operation,
      status,
      ...(data && typeof data === 'object' ? data as Record<string, unknown> : {}),
    };

    switch (status) {
      case 'start':
        this.info(`Starting ${operation}`, operationData);
        break;
      case 'success':
        this.info(`Completed ${operation}`, operationData);
        break;
      case 'error':
        this.error(`Failed ${operation}`, { ...operationData, error });
        break;
    }
  }

  /**
   * Log agent metrics and performance data
   */
  logMetrics(metrics: Record<string, number | string>): void {
    this.info('Agent metrics', { type: 'metrics', ...metrics });
  }

  /**
   * Get log file path for the agent
   */
  getLogFile(): string {
    return join(this.config.logDir, `${this.config.agent}.log`);
  }
}

/**
 * Default logger instance for internal use
 * Individual agents should create their own logger instances
 */
export const logger = new Logger({
  level: 'info',
  agent: 'agent-core',
  enableConsole: true,
  enableFile: false, // Internal logger doesn't write to file
});