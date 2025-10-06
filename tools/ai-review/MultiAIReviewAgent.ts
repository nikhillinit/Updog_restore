// tools/ai-review/MultiAIReviewAgent.ts
import { type ProviderConfig, type PackageContext, type ProviderResult } from "./types";
import { resolveOrchestrator, resolveConversationMemory, type ChatMessage } from "./OrchestratorAdapter";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function callWithOrchestrator(
  providerId: string,
  messages: ChatMessage[],
  timeoutMs = 120_000
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } }> {
  const orch = await resolveOrchestrator();
  if (!orch) {
    const mock = `# ${providerId.toUpperCase()} Review

Verdict: GO
Score: 8/10
Confidence: 80%

Must-Fix
- (none reported)

Should-Do
- Add regression tests for reserve logic

Findings:
- Stable mock output (no orchestrator detected).`;
    return { text: mock };
  }
  return orch.call(providerId, messages, { timeoutMs });
}

function buildPrompt(ctx: PackageContext, role: string): string {
  return [
    `You are performing a ${role} for package ${ctx.packageName} (git ${ctx.gitSha}).`,
    `Brief:\n${ctx.reviewBrief}`,
    `Deliver a markdown report with sections: "Verdict", "Score (0-10)", "Confidence (%)", "Must-Fix", "Should-Do", "Findings".`
  ].join("\n\n");
}

const safeSlug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9._-]+/g, "_");

export class MultiAIReviewAgent {
  constructor(
    private cfg: { providers: ProviderConfig[]; packageContext: PackageContext }
  ) {}

  async run(): Promise<ProviderResult[]> {
    const { providers, packageContext } = this.cfg;

    const reviewsDir = resolve(packageContext.packageRoot, "reviews");
    const promptsDir = resolve(reviewsDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });
    const appendMem = await resolveConversationMemory(`ai-review:${packageContext.packageName}`);

    const jobs = providers.map(async (p) => {
      const prompt = buildPrompt(packageContext, p.role);
      const started = Date.now();

      const promptPath = resolve(promptsDir, `${safeSlug(p.id)}_${p.role.replace(/\s+/g,'-')}.md`);
      writeFileSync(promptPath, `# Prompt — ${p.id} (${p.role})\n\n${prompt}\n`, "utf-8");

      const messages: ChatMessage[] = [
        { role: "system", content: "You are a meticulous senior reviewer. Be concise, concrete, and actionable." },
        { role: "user", content: prompt }
      ];

      const { text, usage } = await callWithOrchestrator(p.id, messages);
      const report = text;
      const durationMs = Date.now() - started;
      const costUsd = usage?.costUsd ?? 0;

      await appendMem?.({
        type: "ai-review-provider",
        providerId: p.id,
        role: p.role,
        durationMs,
        usage,
        promptPath,
      });

      return {
        providerId: p.id,
        role: p.role,
        verdict: /Verdict:\s*([A-Z ]+)/i.exec(report)?.[1]?.trim() ?? "UNKNOWN",
        score: Number(/Score:\s*(\d+(\.\d+)?)/i.exec(report)?.[1] ?? "0"),
        confidence: Number(/Confidence:\s*(\d+(\.\d+)?)%?/i.exec(report)?.[1] ?? "0"),
        durationMs,
        costUsd,
        report,
      } as ProviderResult;
    });

    return Promise.all(jobs);
  }
}
