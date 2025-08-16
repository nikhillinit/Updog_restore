#!/usr/bin/env tsx
/**
 * Circuit Breaker CLI Tool
 * Provides operational control over deployment circuit breaker
 */

import { DeploymentCircuitBreaker } from './deployment-circuit-breaker.js';

interface CLIOptions {
  redisUrl?: string;
  persistenceKey?: string;
}

class CircuitBreakerCLI {
  private breaker: DeploymentCircuitBreaker;

  constructor(options: CLIOptions = {}) {
    this.breaker = new DeploymentCircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 3600000, // 1 hour
      halfOpenTests: 1,
      redisUrl: options.redisUrl || process.env.REDIS_URL || 'memory://',
      persistenceKey: options.persistenceKey || 'deployment-circuit-breaker'
    });
  }

  async status() {
    const status = this.breaker.getStatus();
    console.log('🔌 Circuit Breaker Status:');
    console.log(`   State: ${status.state.toUpperCase()}`);
    console.log(`   Healthy: ${status.healthy ? '✅' : '❌'}`);
    console.log(`   Failure Count: ${status.failureCount}`);
    console.log(`   Success Count: ${status.successCount}`);
    
    if (status.lastFailureTime) {
      console.log(`   Last Failure: ${new Date(status.lastFailureTime).toISOString()}`);
    }
    
    if (status.willResetAt) {
      console.log(`   Will Reset At: ${status.willResetAt.toISOString()}`);
      const minutesUntilReset = Math.ceil((status.willResetAt.getTime() - Date.now()) / 60000);
      console.log(`   Reset In: ${minutesUntilReset} minutes`);
    }
    
    return status;
  }

  async open() {
    console.log('🔓 Manually opening circuit breaker...');
    this.breaker.forceOpen();
    console.log('✅ Circuit breaker is now OPEN (blocking all deployments)');
    await this.status();
  }

  async close() {
    console.log('🔒 Manually closing circuit breaker...');
    await this.breaker.reset();
    console.log('✅ Circuit breaker is now CLOSED (allowing deployments)');
    await this.status();
  }

  async reset() {
    console.log('🔄 Resetting circuit breaker...');
    await this.breaker.reset();
    console.log('✅ Circuit breaker has been reset');
    await this.status();
  }

  async test() {
    console.log('🧪 Testing circuit breaker response...');
    
    try {
      const result = await this.breaker.executeDeployment(async () => {
        console.log('   Simulating successful deployment...');
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      });
      
      console.log('✅ Test deployment succeeded');
      console.log('   Result:', result);
    } catch (error) {
      console.log('❌ Test deployment blocked by circuit breaker');
      console.log('   Error:', error instanceof Error ? error.message : String(error));
    }
    
    await this.status();
  }

  async history() {
    console.log('📊 Circuit Breaker History:');
    
    // In a real implementation, this would query Redis for historical data
    // For now, just show current state
    const status = this.breaker.getStatus();
    
    console.log('   Recent Activity:');
    console.log(`     Total Failures: ${status.failureCount}`);
    console.log(`     Total Successes: ${status.successCount}`);
    
    if (status.lastFailureTime) {
      console.log(`     Last Failure: ${new Date(status.lastFailureTime).toISOString()}`);
    }
  }

  async monitor(seconds: number = 60) {
    console.log(`📡 Monitoring circuit breaker for ${seconds} seconds...`);
    console.log('   Press Ctrl+C to stop');
    
    const interval = setInterval(async () => {
      const status = this.breaker.getStatus();
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${status.state.toUpperCase()} - F:${status.failureCount} S:${status.successCount}`);
    }, 5000);
    
    setTimeout(() => {
      clearInterval(interval);
      console.log('✅ Monitoring complete');
    }, seconds * 1000);
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n✅ Monitoring stopped by user');
      process.exit(0);
    });
  }

  printHelp() {
    console.log('Circuit Breaker CLI - Deployment Safety Control');
    console.log('');
    console.log('Usage:');
    console.log('  tsx scripts/circuit-breaker-cli.ts <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  status     Show current circuit breaker status');
    console.log('  open       Manually open circuit breaker (block deployments)');
    console.log('  close      Manually close circuit breaker (allow deployments)');
    console.log('  reset      Reset circuit breaker to initial state');
    console.log('  test       Test deployment execution with current breaker state');
    console.log('  history    Show circuit breaker activity history');
    console.log('  monitor    Monitor circuit breaker state changes');
    console.log('  help       Show this help message');
    console.log('');
    console.log('Environment Variables:');
    console.log('  REDIS_URL              Redis connection string (default: memory://)');
    console.log('  CIRCUIT_BREAKER_KEY    Persistence key (default: deployment-circuit-breaker)');
    console.log('');
    console.log('Examples:');
    console.log('  tsx scripts/circuit-breaker-cli.ts status');
    console.log('  tsx scripts/circuit-breaker-cli.ts open');
    console.log('  tsx scripts/circuit-breaker-cli.ts monitor 120');
    console.log('  REDIS_URL=redis://localhost:6379 tsx scripts/circuit-breaker-cli.ts reset');
  }
}

async function main() {
  const command = process.argv[2];
  const options: CLIOptions = {
    redisUrl: process.env.REDIS_URL,
    persistenceKey: process.env.CIRCUIT_BREAKER_KEY
  };

  const cli = new CircuitBreakerCLI(options);

  try {
    switch (command) {
      case 'status':
        await cli.status();
        break;
      
      case 'open':
        await cli.open();
        break;
      
      case 'close':
        await cli.close();
        break;
      
      case 'reset':
        await cli.reset();
        break;
      
      case 'test':
        await cli.test();
        break;
      
      case 'history':
        await cli.history();
        break;
      
      case 'monitor':
        const seconds = parseInt(process.argv[3]) || 60;
        await cli.monitor(seconds);
        break;
      
      case 'help':
      case '--help':
      case '-h':
        cli.printHelp();
        break;
      
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "tsx scripts/circuit-breaker-cli.ts help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ CLI Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}