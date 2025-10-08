/**
 * Worker thread for WASM execution
 * Runs in isolated context with resource monitoring
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { performance } = require('perf_hooks');

// Extract worker configuration
const {
  wasmPath,
  functionName,
  args,
  seed,
  engineVersion,
  maxMemoryMB,
  trapNonFinite,
  enableProfiling
} = workerData;

// Initialize random seed for determinism
let randomState = parseInt(seed.substring(0, 8), 16);

// Linear Congruential Generator (LCG) constants from Numerical Recipes
// These are standard ANSI C LCG parameters - intentionally precise 32-bit integers
const LCG_MULTIPLIER = 1103515245;  // Standard LCG multiplier
const LCG_INCREMENT = 12345;         // Standard LCG increment
const LCG_MODULUS = 0x7fffffff;      // 2^31 - 1 (max 32-bit signed int)

function deterministicRandom() {
  randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) & LCG_MODULUS;
  return randomState / LCG_MODULUS;
}

// Override Math.random for determinism
Math.random = deterministicRandom;

// Track non-finite values
let nonFiniteDetected = false;
const originalNumber = Number;
const proxyNumber = new Proxy(Number, {
  construct(target, args) {
    const result = new target(...args);
    checkNonFinite(result, 'Number constructor');
    return result;
  }
});

function checkNonFinite(value, location) {
  if (!isFinite(value)) {
    parentPort.postMessage({
      type: 'non-finite',
      value: value.toString(),
      location
    });
    nonFiniteDetected = true;
    if (trapNonFinite) {
      throw new Error(`Non-finite value detected: ${value} at ${location}`);
    }
  }
  return value;
}

// Wrap math operations to detect NaN/Infinity
const mathOperations = ['sqrt', 'pow', 'log', 'exp', 'sin', 'cos', 'tan'];
mathOperations.forEach(op => {
  const original = Math[op];
  Math[op] = function(...args) {
    const result = original.apply(Math, args);
    checkNonFinite(result, `Math.${op}`);
    return result;
  };
});

async function executeWasm() {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  try {
    // Send initial memory usage
    parentPort.postMessage({
      type: 'memory-usage',
      bytes: startMemory.heapUsed
    });

    // Read WASM file
    const wasmBuffer = fs.readFileSync(wasmPath);
    
    // Configure memory limits
    const memory = new WebAssembly.Memory({
      initial: 16, // 1MB initial (16 * 64KB pages)
      maximum: Math.floor((maxMemoryMB * 1024 * 1024) / 65536), // Convert MB to pages
    });

    // Track gas usage (simplified - counts operations)
    let gasUsed = 0;
    const gasLimit = 1000000;
    
    // Import object with resource tracking
    const importObject = {
      env: {
        memory,
        
        // Abort function for panics
        abort: (msg, file, line, column) => {
          throw new Error(`WASM abort: ${msg} at ${file}:${line}:${column}`);
        },
        
        // Seed for deterministic random
        seed: () => parseInt(seed.substring(8, 16), 16),
        
        // Gas metering
        consumeGas: (amount) => {
          gasUsed += amount;
          if (gasUsed > gasLimit) {
            throw new Error(`Gas limit exceeded: ${gasUsed}/${gasLimit}`);
          }
        },
        
        // Memory tracking
        trackMemory: () => {
          const usage = process.memoryUsage();
          parentPort.postMessage({
            type: 'memory-usage',
            bytes: usage.heapUsed
          });
          
          if (usage.heapUsed > maxMemoryMB * 1024 * 1024) {
            throw new Error(`Memory limit exceeded: ${usage.heapUsed} bytes`);
          }
        },
        
        // Math functions with NaN/Inf checking
        mathSqrt: (x) => checkNonFinite(Math.sqrt(x), 'wasm.sqrt'),
        mathPow: (x, y) => checkNonFinite(Math.pow(x, y), 'wasm.pow'),
        mathLog: (x) => checkNonFinite(Math.log(x), 'wasm.log'),
        
        // Console for debugging (limited)
        consoleLog: (ptr) => {
          if (enableProfiling) {
            console.log(`[WASM]: ${ptr}`);
          }
        }
      },
      
      // WASI preview1 imports (if needed)
      wasi_snapshot_preview1: {
        proc_exit: (code) => {
          throw new Error(`WASM process exit: ${code}`);
        },
        environ_get: () => 0,
        environ_sizes_get: () => 0,
        clock_time_get: () => Date.now() * 1000000, // nanoseconds
        fd_close: () => 0,
        fd_seek: () => 0,
        fd_write: () => 0,
        fd_read: () => 0,
        path_open: () => 0,
        random_get: (ptr, len) => {
          // Fill with deterministic "random" data
          const view = new Uint8Array(memory.buffer, ptr, len);
          for (let i = 0; i < len; i++) {
            view[i] = Math.floor(deterministicRandom() * 256);
          }
          return 0;
        }
      }
    };

    // Instantiate WASM module
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, importObject);
    const wasmInstance = wasmModule.instance;
    
    // Check if function exists
    if (!wasmInstance.exports[functionName]) {
      throw new Error(`Function '${functionName}' not found in WASM module`);
    }
    
    // Monitor memory periodically during execution
    const memoryMonitor = setInterval(() => {
      const usage = process.memoryUsage();
      parentPort.postMessage({
        type: 'memory-usage',
        bytes: usage.heapUsed
      });
    }, 100);

    // Execute the function
    const wasmFunction = wasmInstance.exports[functionName];
    const result = wasmFunction(...args);
    
    // Stop memory monitoring
    clearInterval(memoryMonitor);
    
    // Final memory check
    const endMemory = process.memoryUsage();
    const cpuTime = performance.now() - startTime;
    
    // Send result
    parentPort.postMessage({
      type: 'result',
      result,
      cpuTime,
      gasUsed,
      memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
      nonFiniteCount: nonFiniteDetected ? 1 : 0
    });

  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    process.exit(1);
  }
}

// Execute and handle errors
executeWasm().catch(err => {
  parentPort.postMessage({
    type: 'error',
    error: {
      message: err.message,
      stack: err.stack
    }
  });
  process.exit(1);
});