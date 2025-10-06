// tools/ai-review/types.ts
export type ProviderId = string; // allow cloud, hf:, ollama:

export interface ProviderConfig {
  id: ProviderId;
  role: string;
  costCapUsd: number;
  enabled?: boolean;
}

export interface PackageContext {
  packageName: string;
  packageRoot: string;
  reviewBrief: string;
  gitSha: string;
}

export interface ProviderResult {
  providerId: ProviderId;
  role: string;
  verdict: string;
  score: number;
  confidence: number;
  durationMs: number;
  costUsd: number;
  report: string;
  // usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }; // optional
}

export interface ReviewPlan {
  package: string;
  models: { providerId: ProviderId; role: string }[];
  outputs: {
    folder: string;
    files: Record<string, string>;
  };
}
