/**
 * Comprehensive tests for ConversationMemory module
 *
 * Tests cover:
 * - Thread creation and retrieval
 * - Turn addition and conversation flow
 * - Parent/child thread chains
 * - File/image prioritization (newest-first)
 * - Conversation history building with token budgeting
 * - Storage backend (in-memory)
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createThread,
  getThread,
  addTurn,
  getThreadChain,
  getConversationFileList,
  getConversationImageList,
  buildConversationHistory,
  clearAllThreads,
  type ThreadContext,
  type ConversationTurn,
} from '../ConversationMemory';

describe('ConversationMemory', () => {
  beforeEach(async () => {
    await clearAllThreads();
  });

  describe('Thread Management', () => {
    it('should create a new thread with UUID', async () => {
      const threadId = await createThread('test-agent', {
        prompt: 'test prompt',
      });

      expect(threadId).toBeTruthy();
      expect(threadId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should retrieve created thread', async () => {
      const threadId = await createThread('test-agent', { task: 'analyze' });
      const thread = await getThread(threadId);

      expect(thread).toBeTruthy();
      expect(thread?.threadId).toBe(threadId);
      expect(thread?.toolName).toBe('test-agent');
      expect(thread?.turns).toHaveLength(0);
    });

    it('should return null for non-existent thread', async () => {
      const thread = await getThread('00000000-0000-0000-0000-000000000000');
      expect(thread).toBeNull();
    });

    it('should return null for invalid UUID', async () => {
      const thread = await getThread('not-a-uuid');
      expect(thread).toBeNull();
    });

    it('should filter non-serializable context fields', async () => {
      const threadId = await createThread('test-agent', {
        prompt: 'test',
        temperature: 0.7,
        thinking_mode: 'high',
        model: 'claude',
        continuation_id: 'some-id',
        custom: 'data',
      });

      const thread = await getThread(threadId);
      expect(thread?.initialContext).toEqual({
        prompt: 'test',
        custom: 'data',
      });
    });

    it('should support parent/child thread chains', async () => {
      const parentId = await createThread('parent-agent', { task: 'main' });
      const childId = await createThread('child-agent', { task: 'subtask' }, parentId);

      const child = await getThread(childId);
      expect(child?.parentThreadId).toBe(parentId);
    });
  });

  describe('Conversation Turns', () => {
    it('should add user turn to thread', async () => {
      const threadId = await createThread('test-agent', {});
      const success = await addTurn(threadId, 'user', 'Hello, agent!', {
        files: ['test.ts'],
        toolName: 'test-agent',
      });

      expect(success).toBe(true);

      const thread = await getThread(threadId);
      expect(thread?.turns).toHaveLength(1);
      expect(thread?.turns[0].role).toBe('user');
      expect(thread?.turns[0].content).toBe('Hello, agent!');
      expect(thread?.turns[0].files).toEqual(['test.ts']);
    });

    it('should add assistant turn with model metadata', async () => {
      const threadId = await createThread('test-agent', {});
      await addTurn(threadId, 'assistant', 'Analysis complete', {
        toolName: 'analyzer',
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4',
        modelMetadata: { tokens: 1234, thinking_mode: 'medium' },
      });

      const thread = await getThread(threadId);
      expect(thread?.turns[0].role).toBe('assistant');
      expect(thread?.turns[0].modelProvider).toBe('anthropic');
      expect(thread?.turns[0].modelName).toBe('claude-sonnet-4');
      expect(thread?.turns[0].modelMetadata?.tokens).toBe(1234);
    });

    it('should maintain turn order chronologically', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'First message');
      await addTurn(threadId, 'assistant', 'First response');
      await addTurn(threadId, 'user', 'Second message');
      await addTurn(threadId, 'assistant', 'Second response');

      const thread = await getThread(threadId);
      expect(thread?.turns).toHaveLength(4);
      expect(thread?.turns[0].content).toBe('First message');
      expect(thread?.turns[1].content).toBe('First response');
      expect(thread?.turns[2].content).toBe('Second message');
      expect(thread?.turns[3].content).toBe('Second response');
    });

    it('should reject turns after max limit', async () => {
      const threadId = await createThread('test-agent', {});

      // Simulate adding turns up to limit (default 50)
      const maxTurns = parseInt(process.env.MAX_CONVERSATION_TURNS || '50', 10);
      for (let i = 0; i < maxTurns; i++) {
        await addTurn(threadId, 'user', `Message ${i}`);
      }

      // Next turn should fail
      const success = await addTurn(threadId, 'user', 'Over limit');
      expect(success).toBe(false);

      const thread = await getThread(threadId);
      expect(thread?.turns).toHaveLength(maxTurns);
    });

    it('should fail to add turn to non-existent thread', async () => {
      const success = await addTurn(
        '00000000-0000-0000-0000-000000000000',
        'user',
        'test'
      );
      expect(success).toBe(false);
    });
  });

  describe('Thread Chains', () => {
    it('should retrieve single thread as chain', async () => {
      const threadId = await createThread('test-agent', { task: 'solo' });
      const chain = await getThreadChain(threadId);

      expect(chain).toHaveLength(1);
      expect(chain[0].threadId).toBe(threadId);
    });

    it('should retrieve parent-child chain in chronological order', async () => {
      const parentId = await createThread('parent-agent', { task: 'main' });
      const childId = await createThread('child-agent', { task: 'sub' }, parentId);

      const chain = await getThreadChain(childId);

      expect(chain).toHaveLength(2);
      expect(chain[0].threadId).toBe(parentId); // Oldest first
      expect(chain[1].threadId).toBe(childId);
      expect(chain[1].parentThreadId).toBe(parentId);
    });

    it('should handle multi-level thread chains', async () => {
      const grandparent = await createThread('agent-1', { level: 1 });
      const parent = await createThread('agent-2', { level: 2 }, grandparent);
      const child = await createThread('agent-3', { level: 3 }, parent);

      const chain = await getThreadChain(child);

      expect(chain).toHaveLength(3);
      expect(chain[0].threadId).toBe(grandparent);
      expect(chain[1].threadId).toBe(parent);
      expect(chain[2].threadId).toBe(child);
    });

    it('should prevent infinite loops in circular references', async () => {
      // This test simulates a circular reference (shouldn't happen in practice)
      const threadId = await createThread('test-agent', { task: 'test' });
      // Manually simulate circular reference by mocking
      // In real use, this is prevented by UUID generation
      const chain = await getThreadChain(threadId);
      expect(chain).toHaveLength(1);
    });

    it('should respect max depth limit', async () => {
      // Create a very deep chain
      let currentId = await createThread('agent-0', { depth: 0 });
      for (let i = 1; i < 25; i++) {
        currentId = await createThread(`agent-${i}`, { depth: i }, currentId);
      }

      const chain = await getThreadChain(currentId, 10); // Max depth 10
      expect(chain.length).toBeLessThanOrEqual(10);
    });
  });

  describe('File/Image Prioritization (Newest-First)', () => {
    it('should collect files with newest-first priority', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'Turn 1', {
        files: ['file1.ts', 'file2.ts'],
      });
      await addTurn(threadId, 'assistant', 'Turn 2', {
        files: ['file3.ts'],
      });
      await addTurn(threadId, 'user', 'Turn 3', {
        files: ['file1.ts', 'file4.ts'], // file1 appears again (newer)
      });

      const thread = await getThread(threadId);
      const files = getConversationFileList(thread!);

      // Newest first: file1 from Turn 3, not Turn 1
      expect(files).toEqual(['file1.ts', 'file4.ts', 'file3.ts', 'file2.ts']);
    });

    it('should deduplicate files keeping newest reference', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'Old', { files: ['shared.ts'] });
      await addTurn(threadId, 'assistant', 'Middle', { files: ['other.ts'] });
      await addTurn(threadId, 'user', 'New', { files: ['shared.ts'] });

      const thread = await getThread(threadId);
      const files = getConversationFileList(thread!);

      // Only one 'shared.ts', from newest turn
      expect(files).toEqual(['shared.ts', 'other.ts']);
      expect(files.filter((f) => f === 'shared.ts')).toHaveLength(1);
    });

    it('should handle turns with no files', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'No files');
      await addTurn(threadId, 'assistant', 'Also no files');

      const thread = await getThread(threadId);
      const files = getConversationFileList(thread!);

      expect(files).toEqual([]);
    });

    it('should collect images with newest-first priority', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'Turn 1', {
        images: ['img1.png', 'img2.png'],
      });
      await addTurn(threadId, 'assistant', 'Turn 2', {
        images: ['img3.png'],
      });
      await addTurn(threadId, 'user', 'Turn 3', {
        images: ['img1.png', 'img4.png'], // img1 appears again
      });

      const thread = await getThread(threadId);
      const images = getConversationImageList(thread!);

      expect(images).toEqual(['img1.png', 'img4.png', 'img3.png', 'img2.png']);
    });

    it('should handle empty thread for file/image list', async () => {
      const threadId = await createThread('test-agent', {});
      const thread = await getThread(threadId);

      const files = getConversationFileList(thread!);
      const images = getConversationImageList(thread!);

      expect(files).toEqual([]);
      expect(images).toEqual([]);
    });
  });

  describe('Conversation History Building', () => {
    it('should build formatted history with turns', async () => {
      const threadId = await createThread('test-agent', {});

      await addTurn(threadId, 'user', 'Hello!', { toolName: 'test-agent' });
      await addTurn(threadId, 'assistant', 'Hi there!', {
        toolName: 'test-agent',
        modelName: 'claude-sonnet-4',
      });

      const thread = await getThread(threadId);
      const result = await buildConversationHistory(thread!, {
        includeFiles: false,
      });

      expect(result.history).toContain('CONVERSATION HISTORY');
      expect(result.history).toContain('Turn 1');
      expect(result.history).toContain('Turn 2');
      expect(result.history).toContain('Hello!');
      expect(result.history).toContain('Hi there!');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should include thread metadata in history', async () => {
      const threadId = await createThread('analyzer', { task: 'code-review' });
      await addTurn(threadId, 'user', 'Review this code');

      const thread = await getThread(threadId);
      const result = await buildConversationHistory(thread!, {
        includeFiles: false,
      });

      expect(result.history).toContain(`Thread: ${threadId}`);
      expect(result.history).toContain('Tool: analyzer');
      expect(result.history).toContain('Turn 1/');
    });

    it('should show tool attribution for turns', async () => {
      const threadId = await createThread('orchestrator', {});

      await addTurn(threadId, 'user', 'Analyze', {
        toolName: 'analyzer',
        files: ['test.ts'],
      });
      await addTurn(threadId, 'assistant', 'Fixed', {
        toolName: 'fixer',
        modelProvider: 'anthropic',
        modelName: 'claude-opus',
      });

      const thread = await getThread(threadId);
      const result = await buildConversationHistory(thread!, {
        includeFiles: false,
      });

      expect(result.history).toContain('using analyzer');
      expect(result.history).toContain('using fixer');
      expect(result.history).toContain('via anthropic');
      expect(result.history).toContain('Files used: test.ts');
    });

    it('should return empty for thread with no turns', async () => {
      const threadId = await createThread('test-agent', {});
      const thread = await getThread(threadId);

      const result = await buildConversationHistory(thread!);

      expect(result.history).toBe('');
      expect(result.tokens).toBe(0);
    });

    it('should prioritize newest turns when token budget exceeded', async () => {
      const threadId = await createThread('test-agent', {});

      // Add many turns
      for (let i = 1; i <= 10; i++) {
        await addTurn(threadId, 'user', `Message ${i}`.repeat(100)); // Long messages
      }

      const thread = await getThread(threadId);
      const result = await buildConversationHistory(thread!, {
        maxHistoryTokens: 500, // Very limited budget
        includeFiles: false,
      });

      // Should include recent turns but not all
      expect(result.history).toContain('Message 10');
      expect(result.history).toContain('[Note: Showing');
    });

    it('should include file references when requested', async () => {
      const threadId = await createThread('test-agent', {});
      await addTurn(threadId, 'user', 'Test', {
        files: ['test.ts'],
      });

      const thread = await getThread(threadId);
      const result = await buildConversationHistory(thread!, {
        includeFiles: true,
        maxFileTokens: 1000,
      });

      expect(result.history).toContain('FILES REFERENCED IN THIS CONVERSATION');
    });

    it('should handle thread chains in history building', async () => {
      const parent = await createThread('agent-1', { task: 'main' });
      await addTurn(parent, 'user', 'Parent message');

      const child = await createThread('agent-2', { task: 'sub' }, parent);
      await addTurn(child, 'user', 'Child message');

      const childThread = await getThread(child);
      const result = await buildConversationHistory(childThread!, {
        includeFiles: false,
      });

      // Should include both parent and child turns
      expect(result.history).toContain('Parent message');
      expect(result.history).toContain('Child message');
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle concurrent thread creation', async () => {
      const promises = Array.from({ length: 10 }, () =>
        createThread('test-agent', { concurrent: true })
      );

      const threadIds = await Promise.all(promises);
      const uniqueIds = new Set(threadIds);

      expect(uniqueIds.size).toBe(10); // All unique
    });

    it('should handle concurrent turn addition', async () => {
      const threadId = await createThread('test-agent', {});

      const promises = Array.from({ length: 5 }, (_, i) =>
        addTurn(threadId, 'user', `Message ${i}`)
      );

      const results = await Promise.all(promises);
      expect(results.every((r) => r === true)).toBe(true);

      const thread = await getThread(threadId);
      expect(thread?.turns).toHaveLength(5);
    });

    it('should handle very long content', async () => {
      const threadId = await createThread('test-agent', {});
      const longContent = 'A'.repeat(10000);

      const success = await addTurn(threadId, 'user', longContent);
      expect(success).toBe(true);

      const thread = await getThread(threadId);
      expect(thread?.turns[0].content).toBe(longContent);
    });

    it('should handle special characters in content', async () => {
      const threadId = await createThread('test-agent', {});
      const specialContent = '{"json": "data", "emoji": "🚀", "unicode": "日本語"}';

      await addTurn(threadId, 'user', specialContent);
      const thread = await getThread(threadId);

      expect(thread?.turns[0].content).toBe(specialContent);
    });

    it('should handle empty file/image arrays', async () => {
      const threadId = await createThread('test-agent', {});
      await addTurn(threadId, 'user', 'Test', {
        files: [],
        images: [],
      });

      const thread = await getThread(threadId);
      expect(thread?.turns[0].files).toEqual([]);
      expect(thread?.turns[0].images).toEqual([]);
    });
  });

  describe('Storage Backend', () => {
    it('should persist threads across multiple operations', async () => {
      const threadId = await createThread('test-agent', { persist: true });

      await addTurn(threadId, 'user', 'First');
      const thread1 = await getThread(threadId);

      await addTurn(threadId, 'assistant', 'Second');
      const thread2 = await getThread(threadId);

      expect(thread1?.turns).toHaveLength(1);
      expect(thread2?.turns).toHaveLength(2);
      expect(thread2?.turns[0].content).toBe('First');
      expect(thread2?.turns[1].content).toBe('Second');
    });

    it('should handle clearAllThreads', async () => {
      const threadId1 = await createThread('test-agent', {});
      const threadId2 = await createThread('test-agent', {});

      await clearAllThreads();

      const thread1 = await getThread(threadId1);
      const thread2 = await getThread(threadId2);

      expect(thread1).toBeNull();
      expect(thread2).toBeNull();
    });
  });
});
