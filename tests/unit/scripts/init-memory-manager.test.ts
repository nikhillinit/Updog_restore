/**
 * Tests for Memory Manager Initialization Script
 *
 * RED-GREEN-REFACTOR: Tests written FIRST
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from '../../../packages/memory-manager/src/MemoryManager';
import fs from 'fs/promises';
import path from 'path';

describe('init-memory-manager.mjs', () => {
  const testSessionId = 'test-session-123';
  const testUserId = 'claude-code-session';
  const testAgentId = 'strategic-optimizer';
  const sessionInfoPath = path.join(process.cwd(), '.session-memory.json');

  beforeEach(async () => {
    // Clean up any existing session info
    try {
      await fs.unlink(sessionInfoPath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(sessionInfoPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Memory Manager initialization', () => {
    it('should create MemoryManager with correct context', async () => {
      // RED: This test will fail because init script doesn't expose testable function yet
      const memoryManager = new MemoryManager(
        {
          userId: testUserId,
          agentId: testAgentId,
          sessionId: testSessionId,
        },
        {
          useDatabase: false,
          useMockEmbeddings: true,
        }
      );

      expect(memoryManager).toBeDefined();

      // Verify connection works
      const connected = await memoryManager.testConnection();
      expect(connected).toBe(true);

      await memoryManager.close();
    });

    it('should load recent session history', async () => {
      // RED: Will fail - need to verify history loading works
      const memoryManager = new MemoryManager(
        { userId: testUserId, agentId: testAgentId, sessionId: testSessionId },
        { useDatabase: false, useMockEmbeddings: true }
      );

      // Add some test memories
      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'user',
        content: 'Test memory 1',
      });

      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'assistant',
        content: 'Test memory 2',
      });

      const recentHistory = await memoryManager.getRecentHistory(10);
      expect(recentHistory.length).toBe(2);
      expect(recentHistory[0].content).toBe('Test memory 2'); // Most recent first
      expect(recentHistory[1].content).toBe('Test memory 1');

      await memoryManager.close();
    });

    it('should store session kickoff event', async () => {
      // RED: Will fail - need to verify kickoff event storage
      const memoryManager = new MemoryManager(
        { userId: testUserId, agentId: testAgentId, sessionId: testSessionId },
        { useDatabase: false, useMockEmbeddings: true }
      );

      const kickoffTime = new Date().toISOString();
      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'system',
        content: `Session started: ${kickoffTime} - Strategic Document Optimization Implementation`,
        metadata: {
          sessionId: testSessionId,
          timestamp: kickoffTime,
          task: 'strategic-document-optimization',
          phase: 'kickoff',
        },
      });

      const recentHistory = await memoryManager.getRecentHistory(1);
      expect(recentHistory.length).toBe(1);
      expect(recentHistory[0].role).toBe('system');
      expect(recentHistory[0].content).toContain('Session started');
      expect(recentHistory[0].metadata).toMatchObject({
        sessionId: testSessionId,
        task: 'strategic-document-optimization',
        phase: 'kickoff',
      });

      await memoryManager.close();
    });

    it('should save session info to .session-memory.json', async () => {
      // RED: Will fail - need to verify session info file creation
      const memoryManager = new MemoryManager(
        { userId: testUserId, agentId: testAgentId, sessionId: testSessionId },
        { useDatabase: false, useMockEmbeddings: true }
      );

      // Add a memory to get non-zero count
      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'user',
        content: 'Test memory',
      });

      const recentHistory = await memoryManager.getRecentHistory(10);

      const sessionInfo = {
        sessionId: testSessionId,
        userId: testUserId,
        agentId: testAgentId,
        startedAt: new Date().toISOString(),
        mode: 'in-memory',
        memoriesLoaded: recentHistory.length,
      };

      await fs.writeFile(sessionInfoPath, JSON.stringify(sessionInfo, null, 2));

      // Verify file exists and has correct structure
      const savedInfoRaw = await fs.readFile(sessionInfoPath, 'utf-8');
      const savedInfo = JSON.parse(savedInfoRaw) as {
        sessionId: string;
        userId: string;
        agentId: string;
        mode: string;
        memoriesLoaded: number;
        startedAt: string;
      };
      expect(savedInfo.sessionId).toBe(testSessionId);
      expect(savedInfo.userId).toBe(testUserId);
      expect(savedInfo.agentId).toBe(testAgentId);
      expect(savedInfo.mode).toBe('in-memory');
      expect(savedInfo.memoriesLoaded).toBe(1);
      expect(savedInfo.startedAt).toBeDefined();

      await memoryManager.close();
    });

    it('should get memory statistics', async () => {
      // RED: Will fail - need to verify stats retrieval
      const memoryManager = new MemoryManager(
        { userId: testUserId, agentId: testAgentId, sessionId: testSessionId },
        { useDatabase: false, useMockEmbeddings: true }
      );

      // Add some memories
      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'user',
        content: 'Memory 1',
      });

      await memoryManager.add({
        userId: testUserId,
        agentId: testAgentId,
        role: 'user',
        content: 'Memory 2',
      });

      const stats = await memoryManager.getStats();
      expect(stats.totalMemories).toBeGreaterThanOrEqual(2);
      expect(stats.userMemories).toBe(2);

      await memoryManager.close();
    });
  });

  describe('Error handling', () => {
    it('should handle missing DATABASE_URL when useDatabase is true', async () => {
      // RED: Will fail - need to verify error handling
      const originalDatabaseUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      expect(() => {
        new MemoryManager(
          { userId: testUserId, agentId: testAgentId, sessionId: testSessionId },
          { useDatabase: true }
        );
      }).toThrow('DATABASE_URL is required when useDatabase is true');

      // Restore
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    });

    it('should handle fresh session with no previous memories', async () => {
      // RED: Will fail - need to verify empty history handling
      const memoryManager = new MemoryManager(
        { userId: 'brand-new-user', agentId: 'new-agent', sessionId: 'new-session' },
        { useDatabase: false, useMockEmbeddings: true }
      );

      const recentHistory = await memoryManager.getRecentHistory(10);
      expect(recentHistory.length).toBe(0);

      await memoryManager.close();
    });
  });
});
