// tools/ai-review/SynthesisAgent.ts
import { type ProviderResult } from "./types";

export class SynthesisAgent {
  summarize(results: ProviderResult[]) {
    const scores = results.map(r => r.score).filter(n => !Number.isNaN(n));
    const confidences = results.map(r => r.confidence).filter(n => !Number.isNaN(n));
    const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const avgConfidence = confidences.length ? (confidences.reduce((a,b)=>a+b,0)/confidences.length) : 0;

    const unconditionalGO = results.filter(r => /^GO$/i.test(r.verdict)).length;
    const finalVerdict = unconditionalGO >= 2 ? "GO" : "CONDITIONAL GO";
    const agreement = `${unconditionalGO}/${results.length} unconditional GO`;

    const mustFix = new Set<string>();
    const shouldDo = new Set<string>();
    for (const r of results) {
      for (const line of r.report.split("\n")) {
        if (/^[-*]\s*Must-Fix/i.test(line) || /^Must-Fix/i.test(line)) {
          const val = line.replace(/^[-*]\s*/,'').replace(/^Must-Fix[: ]*/i,'').trim();
          if (val) mustFix.add(val);
        }
        if (/^[-*]\s*Should-Do/i.test(line) || /^Should-Do/i.test(line)) {
          const val = line.replace(/^[-*]\s*/,'').replace(/^Should-Do[: ]*/i,'').trim();
          if (val) shouldDo.add(val);
        }
      }
    }

    const consensus = [
      `# Multi-AI Consensus Report`,
      ``,
      `**FINAL VERDICT:** ${finalVerdict}`,
      ``,
      `**Technical Score (avg):** ${avgScore.toFixed(1)}/10`,
      `**Confidence (avg):** ${avgConfidence.toFixed(0)}%`,
      `**Agreement Level:** ${agreement}`,
      ``,
      `## Must-Fix (P0)`,
      ...([...mustFix].length ? [...mustFix].map(s=>`- ${s}`) : ["- (none reported)"]),
      ``,
      `## Should-Do (P1)`,
      ...([...shouldDo].length ? [...shouldDo].map(s=>`- ${s}`) : ["- (none reported)"]),
      ``,
      `## Model Reports`,
      ...results.map(r => `- ${r.providerId.toUpperCase()}: ${r.role} — verdict ${r.verdict}, score ${r.score}/10, confidence ${r.confidence}%`),
      ``,
    ].join("\n");

    const roadmap = [
      `# Phase 2 Roadmap`,
      ``,
      `1) Close P0 items from consensus`,
      `2) Add test coverage + benchmarks as per findings`,
      `3) Wire dashboards/alerts to track regression`,
      ``,
    ].join("\n");

    const summary =
      `📊 FINAL VERDICT: ${finalVerdict}\n\n` +
      `Technical Score: ${avgScore.toFixed(1)}/10\n` +
      `Confidence: ${avgConfidence.toFixed(0)}%\n` +
      `Agreement Level: ${agreement}\n\n` +
      `🔴 Must-Fix Before Production (P0):\n` +
      ([...mustFix].length ? [...mustFix].map(s=>`- ${s}`).join("\n") : "- (none reported)") + "\n\n" +
      `🟡 Should-Do Soon (P1):\n` +
      ([...shouldDo].length ? [...shouldDo].map(s=>`- ${s}`).join("\n") : "- (none reported)") + "\n";

    return { consensus, roadmap, summary };
  }
}
