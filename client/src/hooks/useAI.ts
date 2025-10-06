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
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'AI request failed');
      }

      const data = await res.json();
      return data.results as AIResponse[];
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
      return res.json() as Promise<{
        calls_today: number;
        limit: number;
        remaining: number;
        total_cost_usd: number;
      }>;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
