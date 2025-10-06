#!/usr/bin/env node
/* eslint-disable no-console */
import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { MultiAIReviewAgent } from "./MultiAIReviewAgent";
import { SynthesisAgent } from "./SynthesisAgent";
import { type ReviewPlan, type ProviderConfig, type PackageContext } from "./types";
import { resolveConversationMemory } from "./OrchestratorAdapter";

// --- Args/env ---------------------------------------------------------------
const args = process.argv.slice(2);
const pkgArg  = args.find(a => a.startsWith("--package="));
const tierArg = args.find(a => a.startsWith("--tier="));
const packageName = pkgArg ? pkgArg.split("=")[1] : process.env.PKG || "";
const tier = (tierArg ? tierArg.split("=")[1] : (process.env.AI_REVIEW_TIER || "cloud")).toLowerCase();
if (!packageName) {
  console.error("Usage: npm run ai:review -- --package=<name> [--tier=mock|local|hf|cloud|all|health]");
  process.exit(2);
}

// --- Resolve package root ---------------------------------------------------
function resolvePackageRoot(name: string): string {
  const candidates = [
    `packages/${name}`,
    `packages/@povc/${name}`,
    `client`,
    `server`,
    name
  ];
  for (const c of candidates) {
    const abs = resolve(process.cwd(), c);
    if (existsSync(abs)) return abs;
  }
  console.error(`Could not find package root for "${name}". Checked: ${candidates.join(", ")}`);
  process.exit(3);
}

const pkgRoot = resolvePackageRoot(packageName);
const reviewsDir = resolve(pkgRoot, "reviews");
mkdirSync(reviewsDir, { recursive: true });

// --- Load review brief ------------------------------------------------------
const reviewBriefPath = resolve(pkgRoot, "AI_REVIEW_PACKAGE.md");
const reviewBrief = existsSync(reviewBriefPath)
  ? readFileSync(reviewBriefPath, "utf-8")
  : `# Review Brief for ${packageName}\n\n(Provide goals, constraints, known risks.)`;

// --- Repo signals -----------------------------------------------------------
function gitHead(): string {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

const context: PackageContext = {
  packageName,
  packageRoot: pkgRoot,
  reviewBrief,
  gitSha: gitHead(),
};

// --- Provider selection (tiers) ---------------------------------------------
function pickProviders(t: string): ProviderConfig[] {
  const local: ProviderConfig[] = [
    { id: "ollama:deepseek-r1",    role: "Code Reasoning",      costCapUsd: 0, enabled: true },
    { id: "ollama:qwen2.5-coder",  role: "Architecture Review", costCapUsd: 0, enabled: true },
  ];
  const hf: ProviderConfig[] = [
    { id: "hf:deepseek-coder-33b", role: "Code Analysis",       costCapUsd: 1.00, enabled: true },
    { id: "hf:codellama-34b",      role: "Code Refactor",       costCapUsd: 1.00, enabled: true },
  ];
  const cloud: ProviderConfig[] = [
    { id: "gpt4",    role: "Architecture Review",  costCapUsd: 1.00, enabled: !!process.env.OPENAI_API_KEY },
    { id: "gemini",  role: "Performance Analysis", costCapUsd: 1.00, enabled: !!process.env.GOOGLE_API_KEY },
    { id: "deepseek",role: "Code Quality",         costCapUsd: 1.00, enabled: !!process.env.DEEPSEEK_API_KEY },
  ].filter(p => p.enabled);

  switch (t) {
    case "mock":   return cloud.length ? cloud : [{ id:"gpt4", role:"Architecture Review", costCapUsd:1, enabled:true }]; // mocked if no keys
    case "local":  return local;
    case "hf":     return hf;
    case "health": return [{ id: "deepseek", role: "Health Check", costCapUsd: 0.25, enabled: true }];
    case "all":    return [...local, ...hf, ...cloud];
    case "cloud":
    default:       return cloud.length ? cloud : [{ id:"gpt4", role:"Architecture Review", costCapUsd:1, enabled:true }];
  }
}
const providers = pickProviders(tier);

// --- Plan & banner ----------------------------------------------------------
const plan: ReviewPlan = {
  package: packageName,
  models: providers.map(p => ({ providerId: p.id, role: p.role })),
  outputs: {
    folder: reviewsDir,
    files: {
      gpt4:     "GPT4_ARCHITECTURE_REVIEW.md",
      gemini:   "GEMINI_PERFORMANCE_REVIEW.md",
      deepseek: "DEEPSEEK_CODE_REVIEW.md",
      consensus:"MULTI_AI_CONSENSUS_REPORT.md",
      roadmap:  "PHASE2_ROADMAP.md"
    }
  }
};

console.log(`\n🤖 Multi-AI Review System\n${"━".repeat(47)}\n`);
console.log(`📦 Package: ${packageName}`);
console.log(`📄 Review Package: ${reviewBriefPath.replace(process.cwd()+"/","")}`);
console.log(`🎯 Tier: ${tier}`);
console.log(`🎯 Models: ${providers.map(p => p.id.toUpperCase()).join(", ")}\n`);
console.log(`${"━".repeat(47)}\n🚀 Spawning Parallel Reviews...\n`);

// --- Run --------------------------------------------------------------------
(async () => {
  const multi = new MultiAIReviewAgent({ providers, packageContext: context });
  const results = await multi.run();

  // Write individual reports
  for (const r of results) {
    const key = (r.providerId.split(":")[0] || r.providerId).toLowerCase();
    const filename = plan.outputs.files[key as keyof typeof plan.outputs.files] ?? `${r.providerId.toUpperCase().replace(/[^A-Z0-9._-]+/g,"_")}_REVIEW.md`;
    const outPath = resolve(reviewsDir, filename);
    writeFileSync(outPath, r.report, "utf-8");
    console.log(`✅ ${r.providerId.toUpperCase()} Complete → ${outPath.replace(process.cwd()+"/","")}`);
  }

  // Synthesize
  console.log(`\n${"━".repeat(47)}\n🔄 Synthesizing Findings...\n`);
  const synth = new SynthesisAgent();
  const { consensus, roadmap, summary } = synth.summarize(results);

  const consensusPath = resolve(reviewsDir, plan.outputs.files.consensus);
  const roadmapPath   = resolve(reviewsDir, plan.outputs.files.roadmap);
  writeFileSync(consensusPath, consensus, "utf-8");
  writeFileSync(roadmapPath, roadmap, "utf-8");

  console.log(`${"━".repeat(47)}\n✅ Multi-AI Review Complete!\n`);
  console.log(summary);

  // Append audit
  const appendMem = await resolveConversationMemory(`ai-review:${packageName}`);
  await appendMem?.({
    type: "ai-review-consensus",
    timestamp: new Date().toISOString(),
    packageName,
    gitSha: context.gitSha,
    providers: providers.map(p => p.id),
    results: results.map(r => ({
      providerId: r.providerId,
      role: r.role,
      verdict: r.verdict,
      score: r.score,
      confidence: r.confidence,
      durationMs: r.durationMs,
      costUsd: r.costUsd
    })),
    consensusPath, roadmapPath
  });
})().catch((err) => {
  console.error("Review failed:", err?.stack ?? err?.message ?? err);
  process.exit(1);
});
