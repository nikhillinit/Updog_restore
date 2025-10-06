// tools/ai-review/OrchestratorAdapter.ts
export type ChatMessage = { role: 'system'|'user'|'assistant'; content: string };

export interface Orchestrator {
  call: (
    providerId: string,
    messages: ChatMessage[],
    opts?: { maxTokens?: number; temperature?: number; timeoutMs?: number }
  ) => Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } }>;
}

// --- Orchestrator resolution (your confirmed paths first) -------------------
const ORCH_CANDIDATES = [
  '@server/services/ai-orchestrator',     // ✅ your alias
  '@/server/services/ai-orchestrator',    // fallback if @/ maps to client/src
  '@/ai/orchestrator',                    // extra fallback
];

export async function resolveOrchestrator(): Promise<Orchestrator | null> {
  for (const p of ORCH_CANDIDATES) {
    try {
      // @ts-ignore dynamic import per tsconfig paths
      const mod = await import(p);
      const maybe = mod?.default ?? mod?.AIRouter ?? mod;
      if (maybe?.call && typeof maybe.call === 'function') return maybe as Orchestrator;
    } catch { /* try next */ }
  }
  return null;
}

// --- ConversationMemory resolution ------------------------------------------
/**
 * Your canonical source is packages/agent-core/src/ConversationMemory.ts
 * We prefer a simple re-export at client/src/ai/ConversationMemory.ts (added below).
 */
const MEM_CANDIDATES = [
  '@/ai/ConversationMemory', // preferred (client re-export)
  '@/agent-core/ConversationMemory', // if you add a client alias later
];

type MemoryAppend = (record: Record<string, unknown>) => Promise<void>;

export async function resolveConversationMemory(namespace: string): Promise<MemoryAppend | null> {
  for (const p of MEM_CANDIDATES) {
    try {
      // @ts-ignore dynamic import per tsconfig paths
      const mod = await import(p);
      // 1) If a class-style ConversationMemory exists with .append()
      const CM = mod?.ConversationMemory ?? mod?.default;
      if (CM) {
        try {
          const mem = new CM({ namespace });
          if (typeof mem.append === 'function') {
            return (r) => mem.append(r);
          }
        } catch {
          /* fall through */
        }
      }
      // 2) If your module exposes createThread/addTurn (functional API)
      const createThread = mod?.createThread ?? mod?.default?.createThread;
      const addTurn = mod?.addTurn ?? mod?.default?.addTurn;
      if (typeof createThread === 'function' && typeof addTurn === 'function') {
        let threadId: string | null = null;
        return async (record) => {
          if (!threadId) {
            threadId = await createThread({ namespace, labels: ['ai-review'] });
          }
          await addTurn(threadId, {
            role: 'system',
            content: JSON.stringify(record, null, 2),
            tags: ['ai-review', namespace],
          });
        };
      }
    } catch { /* keep looking */ }
  }

  // 3) Fallback: JSON audit file to reviews/_audit.json in CWD
  const { writeFileSync, existsSync, readFileSync, mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const outDir = resolve(process.cwd(), 'reviews');
  const outPath = resolve(outDir, '_audit.json');
  mkdirSync(outDir, { recursive: true });
  return async (record) => {
    const arr = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : [];
    arr.push({ ...record, _ts: new Date().toISOString(), _ns: namespace });
    writeFileSync(outPath, JSON.stringify(arr, null, 2), 'utf-8');
  };
}
