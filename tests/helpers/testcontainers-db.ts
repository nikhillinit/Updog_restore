import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

let container: StartedTestContainer | null = null;
let client: Client | null = null;

/**
 * Start an ephemeral Postgres container for integration tests
 * Applies Drizzle schema prerequisites and time-travel analytics migration
 */
export async function startTestDb(): Promise<Client> {
  // Start ephemeral Postgres container
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_PASSWORD: 'test',
      POSTGRES_USER: 'test',
      POSTGRES_DB: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();

  client = new Client({
    host,
    port,
    user: 'test',
    password: 'test',
    database: 'test',
  });

  await client.connect();

  // Apply prerequisite schemas (funds, users tables from Drizzle)
  // Note: In real implementation, import and apply full Drizzle schema
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS funds (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Apply time-travel analytics migration
  const migrationPath = path.join(
    process.cwd(),
    'db/migrations/2025-09-25_time_travel_analytics.sql'
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  await client.query(migrationSql);

  return client;
}

/**
 * Stop and cleanup the test database container
 */
export async function stopTestDb(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
}

/**
 * Helper: Create test data (users and funds)
 * Returns IDs for use in tests
 */
export async function seedTestData(db: Client) {
  // Insert test user
  const userResult = await db.query(`
    INSERT INTO users (email) VALUES ('test@example.com')
    RETURNING id
  `);
  const userId = userResult.rows[0].id;

  // Insert test fund
  const fundResult = await db.query(`
    INSERT INTO funds (name) VALUES ('Test Fund')
    RETURNING id
  `);
  const fundId = fundResult.rows[0].id;

  return { userId, fundId };
}
