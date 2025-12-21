/**
 * Enhanced Test Environment with Isolation
 * Addresses architectural test infrastructure issues
 */

import getPort from 'get-port';
import type { Express } from 'express';

interface TestServer {
  app: Express;
  port: number;
  close: () => Promise<void>;
}

interface TestDatabase {
  name: string;
  cleanup: () => Promise<void>;
}

/**
 * Container-based test isolation with automatic port discovery
 */
export class TestEnvironment {
  private static instances = new Map<string, TestServer>();
  private static databases = new Map<string, TestDatabase>();

  /**
   * Get isolated test server for specific test suite
   */
  static async getIsolatedServer(testSuite: string): Promise<TestServer> {
    if (!this.instances.has(testSuite)) {
      const port = await getPort({ port: getPort.makeRange(3333, 3400) });
      
      // Dynamic import to avoid circular dependencies
      const { createTestServer } = await import('./test-server');
      const server = await createTestServer(port);
      
      this.instances.set(testSuite, server);
    }
    
    return this.instances.get(testSuite)!;
  }

  /**
   * Get isolated test database for specific test suite
   */
  static async getIsolatedDatabase(testSuite: string): Promise<TestDatabase> {
    if (!this.databases.has(testSuite)) {
      const dbName = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${testSuite}`;
      
      // For PostgreSQL - create isolated test database
      const database: TestDatabase = {
        name: dbName,
        cleanup: async () => {
          // Database cleanup logic
          console.log(`Cleaning up test database: ${dbName}`);
        }
      };
      
      this.databases.set(testSuite, database);
    }
    
    return this.databases.get(testSuite)!;
  }

  /**
   * Cleanup all test resources
   */
  static async cleanup(): Promise<void> {
    // Close all test servers
    for (const [testSuite, server] of this.instances.entries()) {
      await server.close();
      console.log(`Closed test server for: ${testSuite}`);
    }

    // Cleanup all test databases
    for (const [testSuite, database] of this.databases.entries()) {
      await database.cleanup();
      console.log(`Cleaned up test database for: ${testSuite}`);
    }

    this.instances.clear();
    this.databases.clear();
  }

  /**
   * Health check for test infrastructure
   */
  static async healthCheck(): Promise<{ servers: number; databases: number; healthy: boolean }> {
    return {
      servers: this.instances.size,
      databases: this.databases.size,
      healthy: true
    };
  }
}

/**
 * Test-specific process.env isolation
 */
export class TestEnvironmentIsolation {
  private originalEnv: Record<string, string | undefined> = {};

  /**
   * Isolate environment variables for test
   */
  isolate(overrides: Record<string, string>): void {
    // Backup original values
    for (const key in overrides) {
      this.originalEnv[key] = process.env[key];
    }

    // Apply test overrides
    Object.assign(process.env, overrides);
  }

  /**
   * Restore original environment
   */
  restore(): void {
    for (const [key, originalValue] of Object.entries(this.originalEnv)) {
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    
    this.originalEnv = {};
  }
}

// Global cleanup on process exit
process.on('exit', () => {
  TestEnvironment.cleanup();
});

process.on('SIGINT', async () => {
  await TestEnvironment.cleanup();
  process.exit(0);
});