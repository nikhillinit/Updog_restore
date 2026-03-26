import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type ModelName = 'claude' | 'gpt' | 'gemini' | 'deepseek';

export interface AIResponse {
  model: ModelName;
  text?: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_usd?: number;
  elapsed_ms?: number;
}

export interface AskAllAIsArgs {
  prompt: string;
  models?: ModelName[];
  tags?: string[];
}

interface AIUsageResponse {
  calls_today: number;
  limit: number;
  remaining: number;
  total_cost_usd: number;
}

const MODEL_NAMES: ReadonlySet<ModelName> = new Set(['claude', 'gpt', 'gemini', 'deepseek']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseJsonPayload(text: string): unknown {
  return text === '' ? null : (JSON.parse(text) as unknown);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload['error'] === 'string') {
    return payload['error'];
  }

  return fallback;
}

function parseUsagePayload(payload: unknown): AIResponse['usage'] | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const promptTokens = asNumber(payload['prompt_tokens']);
  const completionTokens = asNumber(payload['completion_tokens']);
  const totalTokens = asNumber(payload['total_tokens']);

  if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) {
    return undefined;
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function parseAIResponseItem(payload: unknown): AIResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid AI response item');
  }

  const model = payload['model'];
  if (typeof model !== 'string' || !MODEL_NAMES.has(model as ModelName)) {
    throw new Error('Invalid AI response item');
  }
  const usage = parseUsagePayload(payload['usage']);
  const costUsd = asNumber(payload['cost_usd']);
  const elapsedMs = asNumber(payload['elapsed_ms']);

  return {
    model: model as ModelName,
    ...(typeof payload['text'] === 'string' ? { text: payload['text'] } : {}),
    ...(typeof payload['error'] === 'string' ? { error: payload['error'] } : {}),
    ...(usage !== undefined ? { usage } : {}),
    ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    ...(elapsedMs !== undefined ? { elapsed_ms: elapsedMs } : {}),
  };
}

function parseAIResults(payload: unknown): AIResponse[] {
  if (!isRecord(payload) || !Array.isArray(payload['results'])) {
    throw new Error('Invalid AI response');
  }

  return payload['results'].map((item) => parseAIResponseItem(item));
}

function parseUsage(payload: unknown): AIUsageResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid AI usage response');
  }

  const callsToday = asNumber(payload['calls_today']);
  const limit = asNumber(payload['limit']);
  const remaining = asNumber(payload['remaining']);
  const totalCostUsd = asNumber(payload['total_cost_usd']);

  if (
    callsToday === undefined ||
    limit === undefined ||
    remaining === undefined ||
    totalCostUsd === undefined
  ) {
    throw new Error('Invalid AI usage response');
  }

  return {
    calls_today: callsToday,
    limit,
    remaining,
    total_cost_usd: totalCostUsd,
  };
}

export function useAskAllAIs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ prompt, models, tags }: AskAllAIsArgs) => {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, models, tags }),
      });

      if (!res.ok) {
        const errorPayload = parseJsonPayload(await res.text());
        throw new Error(readErrorMessage(errorPayload, 'AI request failed'));
      }

      return parseAIResults(parseJsonPayload(await res.text()));
    },
    onSuccess: () => {
      // Invalidate usage stats to show updated count
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

export function useAIUsage() {
  return useQuery({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      const res = await fetch('/api/ai/usage');
      if (!res.ok) throw new Error('Failed to fetch usage');
      return parseUsage(parseJsonPayload(await res.text()));
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
