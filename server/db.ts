/**
 * Database configuration with automatic serverless optimization
 * Uses HTTP driver on Vercel, WebSocket pool elsewhere
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import * as schema from "@schema";

// Detect if running on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// Dynamic imports based on environment
let db: any;
let pool: any;

if (isVercel) {
  // Use HTTP driver for Vercel (no persistent connections)
  const { drizzle } = require('drizzle-orm/neon-http');
  const { neon } = require('@neondatabase/serverless');
  
  const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL environment variable is required');
  }
  
  const sql = neon(DATABASE_URL);
  db = drizzle(sql, { schema });
  
  // No pool in HTTP mode
  pool = null;
} else {
  // Use WebSocket pool for development and traditional hosting
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import('ws');
  
  neonConfig.webSocketConstructor = ws;
  
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set - using mock mode for API testing");
    process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
  }
  
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { db, pool };
