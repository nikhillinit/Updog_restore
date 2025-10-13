/**
 * Multi-AI Consensus Workflows
 *
 * Specialized workflows for different development scenarios:
 * 1. Code Review Consensus
 * 2. Architecture Decision Records (ADR)
 * 3. Bug Root Cause Analysis
 * 4. Performance Optimization Strategy
 * 5. Security Audit Consensus
 */

import { askAI, type AIProvider } from './portkey-ai.js';
import { AGENT_ROLES, type AgentMessage } from './metagpt-consensus.js';

// ============================================================================
// Workflow 1: Code Review Consensus
// ============================================================================

export interface CodeReviewInput {
  code: string;
  language: string;
  context?: string;
  prDescription?: string;
}

export interface CodeReviewResult {
  unanimous: {
    approve: boolean;
    strengths: string[];
    criticalIssues: string[];
  };
  byAgent: Record<string, {
    rating: number; // 1-10
    approve: boolean;
    feedback: string;
    suggestions: string[];
  }>;
  consensus: {
    overallRating: number;
    shouldMerge: boolean;
    requiredChanges: string[];
    optionalImprovements: string[];
  };
}

export async function reviewCodeWithConsensus(
  input: CodeReviewInput
): Promise<CodeReviewResult> {
  const reviewPrompt = `Review this ${input.language} code as your role.

${input.context ? `Context: ${input.context}\n` : ''}
${input.prDescription ? `PR Description: ${input.prDescription}\n` : ''}

Code:
\`\`\`${input.language}
${input.code}
\`\`\`

Provide:
1. Overall Rating (1-10)
2. Approve/Request Changes decision
3. Strengths (what's good)
4. Issues (what needs fixing)
5. Suggestions (improvements)

Focus on your role's expertise:
- Architect: Design patterns, maintainability, technical debt
- QA: Test coverage, edge cases, error handling
- DevOps: Deployment risks, monitoring, performance
- PM: User impact, timeline risks, scope creep

Format:
## Rating: [1-10]/10
## Decision: [APPROVE/REQUEST_CHANGES]
## Strengths
- ...
## Issues
- ...
## Suggestions
- ...
`;

  // Run reviews in parallel
  const agents = ['architect', 'qa', 'devops', 'projectManager'];
  const reviews = await Promise.allSettled(
    agents.map(async (agentKey) => {
      const agent = AGENT_ROLES[agentKey];
      const result = await askAI(
        agent.provider,
        reviewPrompt,
        undefined,
        {
          includeProjectContext: false,
          systemContext: agent.systemPrompt
        }
      );

      return {
        agent: agentKey,
        review: result.text,
        rating: extractRating(result.text),
        approve: extractDecision(result.text)
      };
    })
  );

  // Build consensus
  const byAgent: Record<string, any> = {};
  const ratings: number[] = [];
  const approvals: boolean[] = [];

  reviews
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .forEach((r) => {
      const { agent, review, rating, approve } = r.value;
      byAgent[agent] = {
        rating,
        approve,
        feedback: review,
        suggestions: extractSuggestions(review)
      };
      ratings.push(rating);
      approvals.push(approve);
    });

  const overallRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const shouldMerge = approvals.filter(Boolean).length >= Math.ceil(approvals.length * 0.75); // 75% approval

  // Synthesize consensus
  const consensusPrompt = `Based on ${agents.length} agent reviews, synthesize the consensus.

Reviews:
${Object.entries(byAgent)
  .map(([agent, data]) => `${AGENT_ROLES[agent].name}: ${data.rating}/10 - ${data.approve ? 'APPROVE' : 'REQUEST CHANGES'}\n${data.feedback.substring(0, 500)}`)
  .join('\n\n')}

Provide:
1. Required changes (must fix before merge)
2. Optional improvements (nice to have)

Format as bullet lists.
`;

  const consensusResult = await askAI('anthropic', consensusPrompt, 'claude-sonnet-4-20250514');

  return {
    unanimous: {
      approve: shouldMerge,
      strengths: extractStrengths(Object.values(byAgent).map((a: any) => a.feedback).join('\n')),
      criticalIssues: extractIssues(Object.values(byAgent).map((a: any) => a.feedback).join('\n'))
    },
    byAgent,
    consensus: {
      overallRating: Math.round(overallRating * 10) / 10,
      shouldMerge,
      requiredChanges: extractRequired(consensusResult.text),
      optionalImprovements: extractOptional(consensusResult.text)
    }
  };
}

// ============================================================================
// Workflow 2: Architecture Decision Records (ADR)
// ============================================================================

export interface ADRInput {
  title: string;
  context: string;
  proposedSolution: string;
  alternatives?: string[];
  constraints?: string[];
}

export interface ADRResult {
  decision: string;
  reasoning: string;
  consequences: {
    positive: string[];
    negative: string[];
    risks: string[];
  };
  alternatives: Array<{
    option: string;
    pros: string[];
    cons: string[];
    votes: number;
  }>;
  consensus: {
    recommendation: string;
    confidence: number;
    dissent: string[];
  };
}

export async function generateADRWithConsensus(
  input: ADRInput
): Promise<ADRResult> {
  const adrPrompt = `Evaluate this architecture decision as your role.

Title: ${input.title}

Context:
${input.context}

Proposed Solution:
${input.proposedSolution}

${input.alternatives?.length ? `Alternatives:\n${input.alternatives.map((alt, i) => `${i + 1}. ${alt}`).join('\n')}` : ''}
${input.constraints?.length ? `Constraints:\n${input.constraints.map(c => `- ${c}`).join('\n')}` : ''}

Provide:
1. Your assessment of the proposed solution (support/oppose)
2. Key pros and cons
3. Risk assessment
4. Alternative preferences (if any)
5. Confidence in your assessment (0-100%)

Focus on your role's concerns:
- Architect: Technical correctness, scalability, maintainability
- PM: Timeline impact, resource requirements, business value
- DevOps: Operational complexity, monitoring, deployment
- QA: Testability, failure modes, rollback strategy
- SecurityEngineer: Threat model, attack surface, compliance
`;

  // Include security engineer for ADRs
  const agents = ['architect', 'projectManager', 'devops', 'qa', 'securityEngineer'];

  const assessments = await Promise.allSettled(
    agents.map(async (agentKey) => {
      const agent = AGENT_ROLES[agentKey] || AGENT_ROLES.architect; // Fallback for securityEngineer
      const provider: AIProvider = agentKey === 'securityEngineer' ? 'deepseek' : agent.provider;

      const result = await askAI(
        provider,
        adrPrompt,
        undefined,
        {
          includeProjectContext: true,
          systemContext: agentKey === 'securityEngineer'
            ? 'You are a security engineer evaluating architecture decisions for security implications.'
            : agent.systemPrompt
        }
      );

      return {
        agent: agentKey,
        assessment: result.text,
        confidence: extractConfidence(result.text)
      };
    })
  );

  // Synthesize ADR
  const synthesisPrompt = `Synthesize an Architecture Decision Record from these ${agents.length} expert assessments.

${assessments
  .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
  .map((r) => `${r.value.agent.toUpperCase()}:\n${r.value.assessment}\n`)
  .join('\n')}

Generate a complete ADR with:
1. Decision statement (what we're doing)
2. Reasoning (why this is the best choice)
3. Positive consequences
4. Negative consequences
5. Risks to monitor
6. Dissenting opinions (if any)

Format as structured sections.
`;

  const adrSynthesis = await askAI('anthropic', synthesisPrompt, 'claude-sonnet-4-20250514');

  return {
    decision: extractSection(adrSynthesis.text, 'Decision'),
    reasoning: extractSection(adrSynthesis.text, 'Reasoning'),
    consequences: {
      positive: extractBullets(adrSynthesis.text, 'Positive'),
      negative: extractBullets(adrSynthesis.text, 'Negative'),
      risks: extractBullets(adrSynthesis.text, 'Risks')
    },
    alternatives: input.alternatives?.map(alt => ({
      option: alt,
      pros: [],
      cons: [],
      votes: 0
    })) || [],
    consensus: {
      recommendation: extractSection(adrSynthesis.text, 'Decision'),
      confidence: 85, // Would calculate from agent confidences
      dissent: extractBullets(adrSynthesis.text, 'Dissent')
    }
  };
}

// ============================================================================
// Workflow 3: Bug Root Cause Analysis
// ============================================================================

export interface BugAnalysisInput {
  description: string;
  stackTrace?: string;
  reproSteps?: string[];
  affectedCode?: string;
  recentChanges?: string;
}

export interface BugAnalysisResult {
  rootCause: string;
  confidence: number;
  byAgent: Record<string, {
    hypothesis: string;
    evidence: string[];
    confidence: number;
  }>;
  consensus: {
    likelyRootCause: string;
    contributingFactors: string[];
    recommendedFix: string;
    preventionStrategy: string;
  };
}

export async function analyzeBugWithConsensus(
  input: BugAnalysisInput
): Promise<BugAnalysisResult> {
  const analysisPrompt = `Analyze this bug from your role's perspective and identify root cause.

Bug Description:
${input.description}

${input.stackTrace ? `Stack Trace:\n${input.stackTrace}\n` : ''}
${input.reproSteps ? `Reproduction Steps:\n${input.reproSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
${input.affectedCode ? `Affected Code:\n\`\`\`\n${input.affectedCode}\n\`\`\`\n` : ''}
${input.recentChanges ? `Recent Changes:\n${input.recentChanges}\n` : ''}

Provide:
1. Your hypothesis (what you think is the root cause)
2. Evidence supporting your hypothesis
3. Confidence level (0-100%)
4. Recommended fix
5. How to prevent similar bugs

Focus on your expertise:
- Architect: Design flaws, architectural issues
- QA: Test coverage gaps, edge cases
- DevOps: Environment issues, deployment problems
- PM: Requirement gaps, user flow issues
`;

  const agents = ['architect', 'qa', 'devops', 'projectManager'];

  const analyses = await Promise.allSettled(
    agents.map(async (agentKey) => {
      const agent = AGENT_ROLES[agentKey];
      const result = await askAI(
        agent.provider,
        analysisPrompt,
        undefined,
        {
          includeProjectContext: true,
          systemContext: agent.systemPrompt
        }
      );

      return {
        agent: agentKey,
        analysis: result.text,
        confidence: extractConfidence(result.text)
      };
    })
  );

  // Build consensus on root cause
  const consensusPrompt = `Synthesize the root cause analysis from ${agents.length} experts.

${analyses
  .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
  .map((r) => `${r.value.agent.toUpperCase()} (confidence: ${r.value.confidence}%):\n${r.value.analysis}\n`)
  .join('\n')}

Provide:
1. Most likely root cause (synthesize from all analyses)
2. Contributing factors
3. Recommended fix (concrete steps)
4. Prevention strategy (how to avoid this in future)

Be specific and actionable.
`;

  const consensus = await askAI('anthropic', consensusPrompt, 'claude-sonnet-4-20250514');

  const byAgent: Record<string, any> = {};
  analyses
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .forEach((r) => {
      byAgent[r.value.agent] = {
        hypothesis: extractSection(r.value.analysis, 'hypothesis'),
        evidence: extractBullets(r.value.analysis, 'evidence'),
        confidence: r.value.confidence
      };
    });

  return {
    rootCause: extractSection(consensus.text, 'root cause'),
    confidence: 85, // Would calculate weighted average
    byAgent,
    consensus: {
      likelyRootCause: extractSection(consensus.text, 'root cause'),
      contributingFactors: extractBullets(consensus.text, 'contributing'),
      recommendedFix: extractSection(consensus.text, 'fix'),
      preventionStrategy: extractSection(consensus.text, 'prevention')
    }
  };
}

// ============================================================================
// Workflow 4: Performance Optimization Strategy
// ============================================================================

export interface PerfOptimizationInput {
  currentMetrics: {
    metric: string;
    current: string;
    target: string;
  }[];
  profilerData?: string;
  constraints?: string[];
  budget?: string;
}

export interface PerfOptimizationResult {
  strategy: {
    phase1: string[];
    phase2: string[];
    phase3: string[];
  };
  expectedImpact: Record<string, string>;
  risks: string[];
  consensus: {
    prioritizedActions: Array<{
      action: string;
      impact: string;
      effort: string;
      votes: number;
    }>;
    quickWins: string[];
    longTermInvestments: string[];
  };
}

export async function generatePerfOptimizationStrategy(
  input: PerfOptimizationInput
): Promise<PerfOptimizationResult> {
  const strategyPrompt = `Propose performance optimization strategy from your role's perspective.

Current Metrics:
${input.currentMetrics.map(m => `- ${m.metric}: ${m.current} → ${m.target}`).join('\n')}

${input.profilerData ? `Profiler Data:\n${input.profilerData}\n` : ''}
${input.constraints?.length ? `Constraints:\n${input.constraints.map(c => `- ${c}`).join('\n')}` : ''}
${input.budget ? `Budget: ${input.budget}\n` : ''}

Provide:
1. Top 3 optimization opportunities (in priority order)
2. Expected impact for each
3. Implementation effort (low/medium/high)
4. Risks and trade-offs
5. Quick wins (can ship this week)
6. Long-term investments (worth 1-3 months)

Focus on your expertise:
- Architect: Algorithmic improvements, caching, architecture
- DevOps: Infrastructure, CDN, database optimization
- QA: Performance test coverage, benchmarking
- PM: User-facing impact, ROI, prioritization
`;

  const agents = ['architect', 'devops', 'qa', 'projectManager'];

  const strategies = await Promise.allSettled(
    agents.map(async (agentKey) => {
      const agent = AGENT_ROLES[agentKey];
      const result = await askAI(
        agent.provider,
        strategyPrompt,
        undefined,
        {
          includeProjectContext: true,
          systemContext: agent.systemPrompt
        }
      );

      return {
        agent: agentKey,
        strategy: result.text
      };
    })
  );

  // Synthesize optimization plan
  const synthesisPrompt = `Create a phased performance optimization strategy from these ${agents.length} expert proposals.

${strategies
  .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
  .map((r) => `${r.value.agent.toUpperCase()}:\n${r.value.strategy}\n`)
  .join('\n')}

Generate:
1. Phase 1 (This Week): Quick wins with high impact
2. Phase 2 (This Month): Medium effort optimizations
3. Phase 3 (This Quarter): Long-term architectural improvements
4. Expected impact per phase
5. Overall risk assessment

Prioritize by impact/effort ratio.
`;

  const optimization = await askAI('anthropic', synthesisPrompt, 'claude-sonnet-4-20250514');

  return {
    strategy: {
      phase1: extractBullets(optimization.text, 'Phase 1'),
      phase2: extractBullets(optimization.text, 'Phase 2'),
      phase3: extractBullets(optimization.text, 'Phase 3')
    },
    expectedImpact: {
      phase1: extractSection(optimization.text, 'Phase 1 impact'),
      phase2: extractSection(optimization.text, 'Phase 2 impact'),
      phase3: extractSection(optimization.text, 'Phase 3 impact')
    },
    risks: extractBullets(optimization.text, 'risk'),
    consensus: {
      prioritizedActions: [], // Would parse from synthesis
      quickWins: extractBullets(optimization.text, 'Phase 1'),
      longTermInvestments: extractBullets(optimization.text, 'Phase 3')
    }
  };
}

// ============================================================================
// Workflow 5: Security Audit Consensus
// ============================================================================

export interface SecurityAuditInput {
  component: string;
  threatModel?: string;
  recentChanges?: string;
  complianceRequirements?: string[];
}

export interface SecurityAuditResult {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  findings: Array<{
    severity: string;
    category: string;
    description: string;
    remediation: string;
    detectedBy: string[];
  }>;
  consensus: {
    criticalIssues: string[];
    recommendedActions: string[];
    complianceGaps: string[];
  };
}

export async function performSecurityAudit(
  input: SecurityAuditInput
): Promise<SecurityAuditResult> {
  const auditPrompt = `Perform security audit from your role's perspective.

Component: ${input.component}

${input.threatModel ? `Threat Model:\n${input.threatModel}\n` : ''}
${input.recentChanges ? `Recent Changes:\n${input.recentChanges}\n` : ''}
${input.complianceRequirements?.length ? `Compliance: ${input.complianceRequirements.join(', ')}\n` : ''}

Identify:
1. Security vulnerabilities (CRITICAL/HIGH/MEDIUM/LOW)
2. Compliance gaps
3. Recommended remediations
4. Overall risk level

Focus areas by role:
- SecurityEngineer: Authentication, authorization, data protection, injection attacks
- Architect: Security architecture, principle of least privilege, defense in depth
- DevOps: Infrastructure security, secrets management, network security
- QA: Security test coverage, penetration testing gaps
`;

  const agents = ['securityEngineer', 'architect', 'devops', 'qa'];
  const providers: AIProvider[] = ['deepseek', 'openai', 'google', 'anthropic'];

  const audits = await Promise.allSettled(
    agents.map(async (agentKey, idx) => {
      const agent = AGENT_ROLES[agentKey] || AGENT_ROLES.architect;
      const result = await askAI(
        providers[idx],
        auditPrompt,
        undefined,
        {
          includeProjectContext: true,
          systemContext: agentKey === 'securityEngineer'
            ? 'You are a security engineer performing a security audit. Identify vulnerabilities, compliance gaps, and security risks.'
            : agent.systemPrompt
        }
      );

      return {
        agent: agentKey,
        audit: result.text
      };
    })
  );

  // Synthesize security findings
  const synthesisPrompt = `Synthesize security audit findings from ${agents.length} experts.

${audits
  .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
  .map((r) => `${r.value.agent.toUpperCase()}:\n${r.value.audit}\n`)
  .join('\n')}

Provide:
1. Overall risk level (LOW/MEDIUM/HIGH/CRITICAL)
2. Critical issues (must fix immediately)
3. Recommended actions (prioritized)
4. Compliance gaps

Be specific about severity and remediation steps.
`;

  const synthesis = await askAI('anthropic', synthesisPrompt, 'claude-sonnet-4-20250514');

  return {
    overallRisk: extractRiskLevel(synthesis.text),
    findings: [], // Would parse from individual audits
    consensus: {
      criticalIssues: extractBullets(synthesis.text, 'critical'),
      recommendedActions: extractBullets(synthesis.text, 'recommended'),
      complianceGaps: extractBullets(synthesis.text, 'compliance')
    }
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractRating(text: string): number {
  const match = text.match(/rating[:\s]+(\d+)\/10/i);
  return match ? parseInt(match[1]) : 5;
}

function extractDecision(text: string): boolean {
  return /approve/i.test(text) && !/request.?changes/i.test(text);
}

function extractSuggestions(text: string): string[] {
  const section = text.split(/suggestions?/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractStrengths(text: string): string[] {
  const section = text.split(/strengths?/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractIssues(text: string): string[] {
  const section = text.split(/issues?/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractRequired(text: string): string[] {
  const section = text.split(/required/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractOptional(text: string): string[] {
  const section = text.split(/optional/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractSection(text: string, keyword: string): string {
  const regex = new RegExp(`${keyword}[:\\s]+(.+?)(?=\\n#|$)`, 'is');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function extractBullets(text: string, keyword: string): string[] {
  const section = text.split(new RegExp(keyword, 'i'))[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractConfidence(text: string): number {
  const match = text.match(/confidence[:\s]+(\d+)%/i);
  return match ? parseInt(match[1]) : 75;
}

function extractRiskLevel(text: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (/critical/i.test(text)) return 'CRITICAL';
  if (/high/i.test(text)) return 'HIGH';
  if (/medium/i.test(text)) return 'MEDIUM';
  return 'LOW';
}
