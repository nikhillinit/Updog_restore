// REFLECTION_ID: REFL-015
// This test is linked to: docs/skills/REFL-015-postgresql-service-missing-test-database.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-015: PostgreSQL Service Missing Test Database
 *
 * CI workflows assume PostgreSQL service containers have a `test` database
 * pre-created, but GitHub Actions PostgreSQL service only creates the
 * default `postgres` database.
 */
describe('REFL-015: PostgreSQL Service Missing Test Database', () => {
  // Simulated CI configuration parser
  interface PostgresService {
    image: string;
    env: Record<string, string>;
    ports?: string[];
    options?: string;
  }

  interface CIWorkflow {
    services?: {
      postgres?: PostgresService;
    };
    steps: Array<{ name: string; run?: string }>;
  }

  // Check if workflow creates required database
  function checkDatabaseConfig(workflow: CIWorkflow): {
    hasPostgresDb: boolean;
    hasExplicitCreation: boolean;
    databaseName: string | null;
    issues: string[];
  } {
    const issues: string[] = [];
    let hasPostgresDb = false;
    let hasExplicitCreation = false;
    let databaseName: string | null = null;

    const postgres = workflow.services?.postgres;

    if (postgres) {
      // Check for POSTGRES_DB env var
      if (postgres.env.POSTGRES_DB) {
        hasPostgresDb = true;
        databaseName = postgres.env.POSTGRES_DB;
      }
    }

    // Check for explicit database creation step
    for (const step of workflow.steps) {
      if (step.run?.includes('CREATE DATABASE')) {
        hasExplicitCreation = true;
        // Extract database name from CREATE DATABASE command
        const match = step.run.match(/CREATE DATABASE (\w+)/i);
        if (match) {
          databaseName = match[1];
        }
      }
    }

    // Identify issues
    if (!hasPostgresDb && !hasExplicitCreation) {
      issues.push('No POSTGRES_DB env var and no explicit CREATE DATABASE step');
    }

    if (postgres && !postgres.env.POSTGRES_PASSWORD) {
      issues.push('POSTGRES_PASSWORD not set');
    }

    return { hasPostgresDb, hasExplicitCreation, databaseName, issues };
  }

  describe('Anti-pattern: Missing database configuration', () => {
    it('should identify missing POSTGRES_DB configuration', () => {
      // ANTI-PATTERN: No POSTGRES_DB specified
      const workflow: CIWorkflow = {
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
              // POSTGRES_DB is missing!
            },
          },
        },
        steps: [
          { name: 'Checkout', run: 'git checkout' },
          { name: 'Run tests', run: 'npm test' },
        ],
      };

      const result = checkDatabaseConfig(workflow);

      expect(result.hasPostgresDb).toBe(false);
      expect(result.hasExplicitCreation).toBe(false);
      expect(result.issues).toContain(
        'No POSTGRES_DB env var and no explicit CREATE DATABASE step'
      );
    });

    it('should demonstrate the "works locally" problem', () => {
      // Local Docker Compose might have different config
      const localDockerCompose = {
        services: {
          postgres: {
            image: 'postgres:15',
            environment: {
              POSTGRES_DB: 'test', // Local config creates database
              POSTGRES_PASSWORD: 'postgres',
            },
          },
        },
      };

      // CI workflow doesn't match local config
      const ciWorkflow: CIWorkflow = {
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
              // Missing POSTGRES_DB!
            },
          },
        },
        steps: [{ name: 'Run tests', run: 'npm test' }],
      };

      const localHasDb = !!localDockerCompose.services.postgres.environment.POSTGRES_DB;
      const ciResult = checkDatabaseConfig(ciWorkflow);

      // Local works, CI fails - classic "works on my machine"
      expect(localHasDb).toBe(true);
      expect(ciResult.hasPostgresDb).toBe(false);
    });

    it('should show typical error message pattern', () => {
      const typicalErrors = [
        'FATAL: database "test" does not exist',
        'error: database "myapp_test" does not exist',
        'ECONNREFUSED 127.0.0.1:5432',
        'connection refused',
      ];

      // These errors indicate missing database configuration
      const isDatabaseMissing = typicalErrors.some(
        (err) =>
          err.includes('does not exist') || err.includes('connection refused')
      );

      expect(isDatabaseMissing).toBe(true);
    });
  });

  describe('Verified fix: Explicit database configuration', () => {
    it('should detect POSTGRES_DB environment variable', () => {
      // Option 1: Use POSTGRES_DB env var
      const workflow: CIWorkflow = {
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
              POSTGRES_DB: 'test', // Database created on startup
            },
            ports: ['5432:5432'],
          },
        },
        steps: [{ name: 'Run tests', run: 'npm test' }],
      };

      const result = checkDatabaseConfig(workflow);

      expect(result.hasPostgresDb).toBe(true);
      expect(result.databaseName).toBe('test');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect explicit CREATE DATABASE step', () => {
      // Option 2: Explicit creation step
      const workflow: CIWorkflow = {
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
            },
          },
        },
        steps: [
          {
            name: 'Setup test database',
            run: 'PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE test;"',
          },
          { name: 'Run tests', run: 'npm test' },
        ],
      };

      const result = checkDatabaseConfig(workflow);

      expect(result.hasExplicitCreation).toBe(true);
      expect(result.databaseName).toBe('test');
    });

    it('should validate complete PostgreSQL configuration', () => {
      const validWorkflow: CIWorkflow = {
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
              POSTGRES_DB: 'test',
              POSTGRES_USER: 'postgres',
            },
            ports: ['5432:5432'],
            options:
              '--health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5',
          },
        },
        steps: [
          { name: 'Checkout', run: 'git checkout' },
          { name: 'Wait for PostgreSQL' },
          { name: 'Run tests', run: 'npm test' },
        ],
      };

      const result = checkDatabaseConfig(validWorkflow);

      expect(result.hasPostgresDb).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(validWorkflow.services?.postgres?.options).toContain('health-cmd');
    });
  });

  describe('Configuration validation helpers', () => {
    interface ConnectionConfig {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    }

    function validateConnectionConfig(config: ConnectionConfig): string[] {
      const errors: string[] = [];

      if (!config.host) errors.push('Missing host');
      if (!config.port) errors.push('Missing port');
      if (!config.user) errors.push('Missing user');
      if (!config.password) errors.push('Missing password');
      if (!config.database) errors.push('Missing database');

      // Check for default database that won't exist
      if (config.database === 'test' || config.database === 'myapp_test') {
        errors.push(
          `Database "${config.database}" must be explicitly created in CI`
        );
      }

      return errors;
    }

    it('should catch missing database in connection config', () => {
      const config: ConnectionConfig = {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'test',
      };

      const errors = validateConnectionConfig(config);

      // Warns that 'test' database needs explicit creation
      expect(errors).toContain(
        'Database "test" must be explicitly created in CI'
      );
    });

    it('should accept properly configured connection', () => {
      const config: ConnectionConfig = {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres', // Default database always exists
      };

      const errors = validateConnectionConfig(config);

      // 'postgres' database always exists, no warning
      expect(errors).toHaveLength(0);
    });
  });
});
