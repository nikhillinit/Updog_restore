/**
 * WASM Resource Management & Deterministic Execution
 * Provides sandboxed, resource-limited, and deterministic WASM execution
 */

import { Worker } from 'worker_threads';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

export interface WasmExecutionOptions {
  maxMemoryMB?: number;
  timeoutMs?: number;
  seed?: string;
  engineVersion?: string;
  trapNonFinite?: boolean;
  enableProfiling?: boolean;
}

export interface WasmExecutionResult<T = any> {
  result: T;
  metadata: {
    seed: string;
    engineVersion: string;
    executionTimeMs: number;
    memoryUsedBytes: number;
    nonFiniteCount: number;
    deterministicHash: string;
    cpuTimeMs?: number;
    gasUsed?: number;
  };
  warnings: string[];
}

export interface WasmExecutionError {
  code: 'TIMEOUT' | 'MEMORY_LIMIT' | 'NON_FINITE' | 'EXECUTION_ERROR';
  message: string;
  details?: any;
}

/**
 * Manages WASM execution with resource limits and determinism
 */
export class WasmRunner extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private executionCount = 0;
  private totalCpuTime = 0;
  private totalMemoryUsed = 0;

  constructor(
    private readonly defaultOptions: WasmExecutionOptions = {
      maxMemoryMB: 256,
      timeoutMs: 30000,
      trapNonFinite: true,
      engineVersion: '1.0.0'
    }
  ) {
    super();
  }

  /**
   * Execute WASM module with resource limits
   */
  async execute<T = any>(
    wasmPath: string,
    functionName: string,
    args: any[],
    options: WasmExecutionOptions = {}
  ): Promise<WasmExecutionResult<T>> {
    const opts = { ...this.defaultOptions, ...options };
    const executionId = `exec-${++this.executionCount}-${Date.now()}`;
    
    // Generate or use provided seed for determinism
    const seed = opts.seed || crypto.randomBytes(16).toString('hex');
    
    const workerData = {
      wasmPath,
      functionName,
      args,
      seed,
      engineVersion: opts.engineVersion,
      maxMemoryMB: opts.maxMemoryMB,
      trapNonFinite: opts.trapNonFinite,
      enableProfiling: opts.enableProfiling
    };

    return new Promise((resolve, reject) => {
      // Create worker thread for isolated execution
      const worker = new Worker(
        path.join(__dirname, 'wasm-worker.js'),
        { workerData }
      );

      this.workers.set(executionId, worker);
      
      const startTime = Date.now();
      let timedOut = false;
      let memoryUsage = 0;
      let nonFiniteCount = 0;
      const warnings: string[] = [];

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        worker.terminate();
        this.workers.delete(executionId);
        
        const error: WasmExecutionError = {
          code: 'TIMEOUT',
          message: `WASM execution exceeded timeout of ${opts.timeoutMs}ms`,
          details: { executionId, functionName, timeoutMs: opts.timeoutMs }
        };
        
        this.emit('timeout', { executionId, functionName, duration: Date.now() - startTime });
        reject(error);
      }, opts.timeoutMs!);

      // Handle worker messages
      worker.on('message', (msg) => {
        if (msg.type === 'memory-usage') {
          memoryUsage = msg.bytes;
          if (msg.bytes > (opts.maxMemoryMB! * 1024 * 1024)) {
            worker.terminate();
            clearTimeout(timeout);
            this.workers.delete(executionId);
            
            const error: WasmExecutionError = {
              code: 'MEMORY_LIMIT',
              message: `Memory limit exceeded: ${msg.bytes} bytes`,
              details: { executionId, limit: opts.maxMemoryMB! * 1024 * 1024 }
            };
            
            this.emit('memory-limit', { executionId, bytes: msg.bytes });
            reject(error);
          }
        } else if (msg.type === 'non-finite') {
          nonFiniteCount++;
          warnings.push(`Non-finite value detected: ${msg.value} at ${msg.location}`);
          
          if (opts.trapNonFinite) {
            worker.terminate();
            clearTimeout(timeout);
            this.workers.delete(executionId);
            
            const error: WasmExecutionError = {
              code: 'NON_FINITE',
              message: `Non-finite value trapped: ${msg.value}`,
              details: { executionId, value: msg.value, location: msg.location }
            };
            
            this.emit('non-finite', { executionId, value: msg.value });
            reject(error);
          }
        } else if (msg.type === 'result') {
          clearTimeout(timeout);
          const executionTime = Date.now() - startTime;
          
          // Compute deterministic hash of result
          const deterministicHash = crypto
            .createHash('sha256')
            .update(JSON.stringify({
              seed,
              engineVersion: opts.engineVersion,
              result: msg.result
            }))
            .digest('hex');
          
          // Clean up worker
          worker.terminate();
          this.workers.delete(executionId);
          
          // Update stats
          this.totalCpuTime += msg.cpuTime || executionTime;
          this.totalMemoryUsed += memoryUsage;
          
          const result: WasmExecutionResult<T> = {
            result: msg.result,
            metadata: {
              seed,
              engineVersion: opts.engineVersion!,
              executionTimeMs: executionTime,
              memoryUsedBytes: memoryUsage,
              nonFiniteCount,
              deterministicHash,
              cpuTimeMs: msg.cpuTime,
              gasUsed: msg.gasUsed
            },
            warnings
          };
          
          this.emit('execution-complete', { 
            executionId, 
            duration: executionTime,
            memoryUsed: memoryUsage 
          });
          
          resolve(result);
        }
      });

      // Handle worker errors
      worker.on('error', (err) => {
        clearTimeout(timeout);
        worker.terminate();
        this.workers.delete(executionId);
        
        const error: WasmExecutionError = {
          code: 'EXECUTION_ERROR',
          message: err.message,
          details: { executionId, error: err }
        };
        
        this.emit('execution-error', { executionId, error: err });
        reject(error);
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (!timedOut && code !== 0) {
          clearTimeout(timeout);
          this.workers.delete(executionId);
          
          const error: WasmExecutionError = {
            code: 'EXECUTION_ERROR',
            message: `Worker exited with code ${code}`,
            details: { executionId, exitCode: code }
          };
          
          reject(error);
        }
      });
    });
  }

  /**
   * Execute multiple WASM functions with batch resource limits
   */
  async executeBatch<T = any>(
    executions: Array<{
      wasmPath: string;
      functionName: string;
      args: any[];
      options?: WasmExecutionOptions;
    }>,
    batchOptions: {
      maxTotalTimeMs?: number;
      maxTotalMemoryMB?: number;
      concurrency?: number;
    } = {}
  ): Promise<WasmExecutionResult<T>[]> {
    const {
      maxTotalTimeMs = 120000, // 2 minutes total
      maxTotalMemoryMB = 1024,  // 1GB total
      concurrency = 4
    } = batchOptions;

    const batchStartTime = Date.now();
    const results: WasmExecutionResult<T>[] = [];
    const queue = [...executions];
    const executing = new Set<Promise<WasmExecutionResult<T>>>();

    while (queue.length > 0 || executing.size > 0) {
      // Check batch timeout
      if (Date.now() - batchStartTime > maxTotalTimeMs) {
        throw new Error(`Batch execution exceeded timeout of ${maxTotalTimeMs}ms`);
      }

      // Check total memory usage
      if (this.totalMemoryUsed > maxTotalMemoryMB * 1024 * 1024) {
        throw new Error(`Batch memory usage exceeded limit of ${maxTotalMemoryMB}MB`);
      }

      // Start new executions up to concurrency limit
      while (executing.size < concurrency && queue.length > 0) {
        const exec = queue.shift()!;
        const promise = this.execute(
          exec.wasmPath,
          exec.functionName,
          exec.args,
          exec.options
        );
        
        executing.add(promise as Promise<WasmExecutionResult<T>>);
        
        promise.then(
          (result) => {
            results.push(result);
            executing.delete(promise as Promise<WasmExecutionResult<T>>);
          },
          (error) => {
            executing.delete(promise as Promise<WasmExecutionResult<T>>);
            throw error;
          }
        );
      }

      // Wait for at least one to complete
      if (executing.size > 0) {
        await Promise.race(executing);
      }
    }

    return results;
  }

  /**
   * Terminate all running workers
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.workers.values()).map(worker => 
      worker.terminate()
    );
    await Promise.all(promises);
    this.workers.clear();
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      executionCount: this.executionCount,
      activeWorkers: this.workers.size,
      totalCpuTimeMs: this.totalCpuTime,
      totalMemoryUsedBytes: this.totalMemoryUsed,
      averageCpuTimeMs: this.executionCount > 0 ? this.totalCpuTime / this.executionCount : 0,
      averageMemoryBytes: this.executionCount > 0 ? this.totalMemoryUsed / this.executionCount : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.executionCount = 0;
    this.totalCpuTime = 0;
    this.totalMemoryUsed = 0;
  }
}

// Singleton instance
export const wasmRunner = new WasmRunner();

// Export helper functions
export async function runWasmCalculation<T = any>(
  wasmPath: string,
  functionName: string,
  args: any[],
  options?: WasmExecutionOptions
): Promise<WasmExecutionResult<T>> {
  return wasmRunner.execute<T>(wasmPath, functionName, args, options);
}

export async function runWasmBatch<T = any>(
  executions: Array<{
    wasmPath: string;
    functionName: string;
    args: any[];
    options?: WasmExecutionOptions;
  }>,
  batchOptions?: {
    maxTotalTimeMs?: number;
    maxTotalMemoryMB?: number;
    concurrency?: number;
  }
): Promise<WasmExecutionResult<T>[]> {
  return wasmRunner.executeBatch<T>(executions, batchOptions);
}