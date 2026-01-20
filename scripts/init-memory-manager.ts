#!/usr/bin/env npx tsx
/**
 * Initialize Memory Manager for AI Agent Sessions
 *
 * This script initializes the MemoryManager at session start,
 * enabling context storage and retrieval to eliminate temporal displacement.
 *
 * Usage:
 *   npx tsx scripts/init-memory-manager.ts [--session-id <id>] [--use-database]
 *
 * Modes:
 *   - In-memory (default): Fast, session-scoped
 *   - Database (--use-database): Persistent, cross-session
 */

import { MemoryManager } from '../packages/memory-manager/src/index';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Parse command-line arguments
const args = process.argv.slice(2);
const sessionId = args.includes('--session-id')
  ? args[args.indexOf('--session-id') + 1]
  : randomUUID();
const useDatabase = args.includes('--use-database');
const userId = 'claude-code-session';
const agentId = 'strategic-optimizer';

async function initializeMemoryManager() {
  console.log('[INIT] Memory Manager Initialization');
  console.log(`[INFO] Session ID: ${sessionId}`);
  console.log(`[INFO] Mode: ${useDatabase ? 'DATABASE' : 'IN-MEMORY'}`);

  try {
    // Create memory manager instance
    const memoryManager = new MemoryManager(
      {
        userId,
        agentId,
        sessionId,
      },
      {
        useDatabase,
        databaseUrl: process.env.DATABASE_URL,
        useMockEmbeddings: true, // Use mock embeddings for faster startup
      }
    );

    // Test connection
    console.log('[CHECK] Testing connection...');
    const connected = await memoryManager.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to memory backend');
    }
    console.log('[PASS] Connection successful');

    // Load session context from previous sessions
    console.log('[LOAD] Retrieving session context...');
    const recentMemories = await memoryManager.getRecentHistory(10);
    console.log(`[INFO] Found ${recentMemories.length} recent memory entries`);

    // Display recent context
    if (recentMemories.length > 0) {
      console.log('\n[CONTEXT] Recent Session Memory:');
      recentMemories.slice(0, 5).forEach((memory, idx) => {
        console.log(`  ${idx + 1}. [${memory.role}] ${memory.content.substring(0, 80)}...`);
      });
    } else {
      console.log('[INFO] No previous session context found (fresh start)');
    }

    // Store session kickoff event
    console.log('\n[STORE] Recording session kickoff...');
    await memoryManager.add({
      userId,
      agentId,
      role: 'system',
      content: `Session started: ${new Date().toISOString()} - Strategic Document Optimization Implementation`,
      metadata: {
        sessionId,
        timestamp: new Date().toISOString(),
        task: 'strategic-document-optimization',
        phase: 'kickoff',
      },
    });

    // Get memory statistics
    const stats = await memoryManager.getStats();
    console.log('\n[STATS] Memory Statistics:');
    console.log(`  Total memories: ${stats.totalMemories}`);
    console.log(`  User memories: ${stats.userMemories}`);

    // Save session info for later retrieval
    const sessionInfo = {
      sessionId,
      userId,
      agentId,
      startedAt: new Date().toISOString(),
      mode: useDatabase ? 'database' : 'in-memory',
      memoriesLoaded: recentMemories.length,
    };

    const sessionInfoPath = path.join(process.cwd(), '.session-memory.json');
    await fs.writeFile(sessionInfoPath, JSON.stringify(sessionInfo, null, 2));
    console.log(`\n[SUCCESS] Session info saved to ${sessionInfoPath}`);

    // Close connections
    await memoryManager.close();

    console.log('\n[COMPLETE] Memory Manager initialized successfully');
    console.log('[NOTE] Session context loaded and ready for agent workflows');

    return {
      success: true,
      sessionId,
      memoriesLoaded: recentMemories.length,
    };
  } catch (error) {
    const err = error as Error;
    console.error('\n[ERROR] Failed to initialize Memory Manager:', err.message);
    if (err.stack) {
      console.error('[STACK]', err.stack);
    }
    process.exit(1);
  }
}

// Run initialization
initializeMemoryManager()
  .then((result) => {
    console.log(`\n[RESULT] ${JSON.stringify(result, null, 2)}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('[FATAL]', error);
    process.exit(1);
  });
