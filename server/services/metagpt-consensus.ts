/**
 * MetaGPT-Inspired Multi-Agent Consensus System
 *
 * Role-based agents collaborate to analyze CI/CD strategy:
 * - Project Manager: Timeline and resource feasibility
 * - Technical Architect: Technical debt and architecture
 * - DevOps Engineer: CI/CD automation and monitoring
 * - QA Engineer: Testing strategy and quality gates
 */

import { askAI, askMultipleAIs, type AIProvider } from './portkey-ai.js';

// ============================================================================
// Agent Roles & Configuration
// ============================================================================

export interface AgentRole {
  name: string;
  provider: AIProvider;
  systemPrompt: string;
  focus: string[];
  reviewCriteria: string[];
}

export const AGENT_ROLES: Record<string, AgentRole> = {
  projectManager: {
    name: 'Project Manager',
    provider: 'anthropic',
    systemPrompt: `You are an experienced project manager evaluating a CI/CD recovery strategy.

Your focus:
- Timeline feasibility and resource allocation
- Developer velocity and burnout risks
- Gate achievability from baseline
- Risk assessment and mitigation

Review criteria:
- Is the timeline realistic?
- Are gates achievable from stated baseline?
- What are burnout risks?
- Where are timeline buffers needed?

Provide specific, data-driven feedback with percentages and dates.`,
    focus: ['timeline', 'velocity', 'burnout risk', 'gates', 'resource allocation'],
    reviewCriteria: ['achievability', 'sustainability', 'risk level']
  },

  architect: {
    name: 'Technical Architect',
    provider: 'openai',
    systemPrompt: `You are a technical architect reviewing a TypeScript migration and technical debt strategy.

Your focus:
- Dependency chain validation
- Technical debt remediation patterns
- Refactoring safety and testing
- Build system configuration

Review criteria:
- Is the TypeScript-first approach correct?
- Are dependency chains accurate?
- Are engine fixes safe with existing tests?
- When should compiler bypasses be removed?

Provide architectural analysis with technical justification.`,
    focus: ['technical debt', 'dependency chains', 'refactoring patterns', 'type safety'],
    reviewCriteria: ['correctness', 'sustainability', 'technical merit']
  },

  devops: {
    name: 'DevOps Engineer',
    provider: 'google',
    systemPrompt: `You are a DevOps engineer evaluating CI/CD automation and monitoring strategy.

Your focus:
- CI/CD pipeline efficiency
- Monitoring cadence and alerting
- Deployment safety and rollback
- Automation opportunities

Review criteria:
- Is monitoring frequency appropriate?
- Are quarantine schedules optimal?
- Is parallel CI validation sufficient?
- What automation is missing?

Provide operational recommendations with SLO targets.`,
    focus: ['monitoring', 'automation', 'deployment safety', 'observability'],
    reviewCriteria: ['reliability', 'observability', 'operational efficiency']
  },

  qa: {
    name: 'QA Engineer',
    provider: 'anthropic',
    systemPrompt: `You are a QA engineer reviewing testing strategy and quality gates.

Your focus:
- Test coverage and safety nets
- Exit gate effectiveness
- Rollback procedures
- Quality assurance processes

Review criteria:
- Are parity tests adequate for engine changes?
- Are exit gates well-defined?
- What happens when gates are missed?
- Is rollback strategy sound?

Provide quality-focused analysis with test coverage recommendations.`,
    focus: ['testing strategy', 'exit criteria', 'rollback procedures', 'quality gates'],
    reviewCriteria: ['test coverage', 'gate effectiveness', 'failure recovery']
  },

  codeReviewer: {
    name: 'Code Reviewer',
    provider: 'deepseek',
    systemPrompt: `You are a code reviewer and technical analyst evaluating implementation details and code quality aspects of a CI/CD strategy.

Your focus:
- Code quality patterns and anti-patterns
- Implementation feasibility
- Automation script quality
- Technical implementation details

Review criteria:
- Are the proposed fixes technically sound?
- What edge cases are missed?
- Are automation scripts robust?
- What implementation risks exist?

Provide code-focused analysis with implementation recommendations. Challenge assumptions about "easy" fixes.`,
    focus: ['code quality', 'implementation details', 'edge cases', 'automation scripts'],
    reviewCriteria: ['technical correctness', 'edge case coverage', 'implementation risk']
  }
};

// ============================================================================
// Message Types for Agent Communication
// ============================================================================

export interface AgentMessage {
  id: string;
  from: string;
  to: string[];
  type: 'analysis' | 'challenge' | 'proposal' | 'consensus';
  topic: string;
  content: string;
  confidence: number; // 0-100
  timestamp: string;
  dependencies?: string[];
}

export interface RoundResult {
  round: number;
  messages: AgentMessage[];
  summary: string;
}

export interface ConsensusResult {
  unanimous: Array<{ decision: string; confidence: number }>;
  majority: Array<{ decision: string; votes: Record<string, boolean>; confidence: number }>;
  split: Array<{ decision: string; votes: Record<string, string>; userChoice: boolean }>;
  dissent: Array<{ agent: string; opinion: string; reasoning: string }>;
}

// ============================================================================
// Round 1: Independent Analysis
// ============================================================================

export async function round1_independentAnalysis(
  strategyDocument: string
): Promise<RoundResult> {
  const agents = Object.keys(AGENT_ROLES);

  const analysisPrompt = `Analyze this CI/CD recovery strategy from your role's perspective.

Strategy Document:
${strategyDocument}

Provide your independent analysis covering:
1. What you agree with (be specific)
2. What concerns you (with evidence)
3. Your recommendations (with justification)
4. Confidence level in the overall approach (0-100%)

Format as:
## Agreements
- [specific points]

## Concerns
- [specific issues with reasoning]

## Recommendations
- [actionable suggestions]

## Overall Confidence: [0-100]%
`;

  // Run all agents in parallel
  const results = await Promise.allSettled(
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
        name: agent.name,
        analysis: result.text,
        usage: result.usage
      };
    })
  );

  // Convert results to messages
  const messages: AgentMessage[] = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r, idx) => ({
      id: `r1-${idx}`,
      from: r.value.agent,
      to: ['all'],
      type: 'analysis' as const,
      topic: 'Independent Strategy Analysis',
      content: r.value.analysis,
      confidence: extractConfidence(r.value.analysis),
      timestamp: new Date().toISOString()
    }));

  return {
    round: 1,
    messages,
    summary: `${messages.length} agents completed independent analysis`
  };
}

// ============================================================================
// Round 2: Cross-Review
// ============================================================================

export async function round2_crossReview(
  round1: RoundResult
): Promise<RoundResult> {
  // Each agent reviews another agent's analysis
  const crossReviewPairs = [
    { reviewer: 'architect', reviewee: 'projectManager' },
    { reviewer: 'projectManager', reviewee: 'architect' },
    { reviewer: 'devops', reviewee: 'qa' },
    { reviewer: 'qa', reviewee: 'devops' }
  ];

  const reviewPrompt = (reviewerRole: string, revieweeAnalysis: string) => `
You are reviewing another agent's analysis of the CI/CD strategy.

Their analysis:
${revieweeAnalysis}

As ${AGENT_ROLES[reviewerRole].name}, provide:
1. Points of agreement (what they got right)
2. Challenges (where you disagree and why)
3. Enhancements (how to improve their recommendations)
4. Your confidence in their analysis (0-100%)

Be constructive but critical. Challenge assumptions with evidence.
`;

  const results = await Promise.allSettled(
    crossReviewPairs.map(async ({ reviewer, reviewee }) => {
      const revieweeMessage = round1.messages.find(m => m.from === reviewee);
      if (!revieweeMessage) return null;

      const agent = AGENT_ROLES[reviewer];
      const result = await askAI(
        agent.provider,
        reviewPrompt(reviewer, revieweeMessage.content),
        undefined,
        {
          includeProjectContext: true,
          systemContext: agent.systemPrompt
        }
      );

      return {
        reviewer,
        reviewee,
        review: result.text,
        usage: result.usage
      };
    })
  );

  const messages: AgentMessage[] = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value)
    .map((r, idx) => ({
      id: `r2-${idx}`,
      from: r.value!.reviewer,
      to: [r.value!.reviewee],
      type: 'challenge' as const,
      topic: `Cross-Review: ${AGENT_ROLES[r.value!.reviewer].name} → ${AGENT_ROLES[r.value!.reviewee].name}`,
      content: r.value!.review,
      confidence: extractConfidence(r.value!.review),
      timestamp: new Date().toISOString(),
      dependencies: [`r1-${Object.keys(AGENT_ROLES).indexOf(r.value!.reviewee)}`]
    }));

  return {
    round: 2,
    messages,
    summary: `${messages.length} cross-reviews completed`
  };
}

// ============================================================================
// Round 3: Debate Conflicts
// ============================================================================

export async function round3_debateConflicts(
  round1: RoundResult,
  round2: RoundResult,
  debateTopics: string[]
): Promise<RoundResult> {
  const debatePrompt = (topic: string, previousAnalyses: string) => `
Debate topic: ${topic}

Previous analyses from all agents:
${previousAnalyses}

As your role, provide:
1. Your position on this specific topic
2. Your reasoning (with evidence from the strategy doc)
3. Counter-arguments to other positions
4. Compromise proposals if applicable
5. Confidence in your position (0-100%)

Be specific and data-driven.
`;

  const messages: AgentMessage[] = [];

  for (const topic of debateTopics) {
    const previousAnalyses = [
      ...round1.messages.map(m => `${AGENT_ROLES[m.from].name}: ${m.content.substring(0, 500)}...`),
      ...round2.messages.map(m => `${AGENT_ROLES[m.from].name} review: ${m.content.substring(0, 300)}...`)
    ].join('\n\n');

    const results = await Promise.allSettled(
      Object.keys(AGENT_ROLES).map(async (agentKey) => {
        const agent = AGENT_ROLES[agentKey];
        const result = await askAI(
          agent.provider,
          debatePrompt(topic, previousAnalyses),
          undefined,
          {
            includeProjectContext: true,
            systemContext: agent.systemPrompt
          }
        );

        return {
          agent: agentKey,
          position: result.text,
          usage: result.usage
        };
      })
    );

    results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .forEach((r, idx) => {
        messages.push({
          id: `r3-${topic.replace(/\s+/g, '-')}-${idx}`,
          from: r.value.agent,
          to: ['all'],
          type: 'proposal' as const,
          topic: `Debate: ${topic}`,
          content: r.value.position,
          confidence: extractConfidence(r.value.position),
          timestamp: new Date().toISOString()
        });
      });
  }

  return {
    round: 3,
    messages,
    summary: `${debateTopics.length} topics debated by ${Object.keys(AGENT_ROLES).length} agents`
  };
}

// ============================================================================
// Round 4: Build Final Consensus
// ============================================================================

export async function round4_buildConsensus(
  round1: RoundResult,
  round2: RoundResult,
  round3: RoundResult
): Promise<ConsensusResult> {
  const allMessages = [
    ...round1.messages,
    ...round2.messages,
    ...round3.messages
  ];

  const consensusPrompt = `Based on all agent analyses and debates, synthesize the final consensus.

All agent messages:
${allMessages.map(m => `${AGENT_ROLES[m.from].name} (${m.topic}): ${m.content.substring(0, 400)}...`).join('\n\n')}

Identify:
1. **UNANIMOUS DECISIONS** (all agents agree 100%)
2. **MAJORITY CONSENSUS** (3+ agents agree, with refinements)
3. **SPLIT DECISIONS** (50/50 split, user must decide)
4. **DISSENTING OPINIONS** (valuable minority viewpoints)

For each category, be specific about what the decision is and who voted how.
Format as structured sections with bullet points.
`;

  const result = await askAI(
    'anthropic',
    consensusPrompt,
    'claude-sonnet-4-20250514',
    {
      includeProjectContext: true,
      systemContext: 'You are synthesizing multi-agent consensus into actionable recommendations.'
    }
  );

  // Parse consensus (simplified - in production would use structured output)
  const consensus: ConsensusResult = {
    unanimous: extractDecisions(result.text, 'UNANIMOUS'),
    majority: extractDecisions(result.text, 'MAJORITY'),
    split: extractDecisions(result.text, 'SPLIT'),
    dissent: extractDissent(result.text)
  };

  return consensus;
}

// ============================================================================
// Main Orchestration
// ============================================================================

export async function analyzeStrategy(
  strategyDocument: string,
  debateTopics: string[] = [
    'Week 1 CI target: 50% vs 70%',
    'Renovate: pause vs security-only',
    'Monitoring: daily vs hourly',
    'Quarantine: nightly vs weekly'
  ]
): Promise<{
  round1: RoundResult;
  round2: RoundResult;
  round3: RoundResult;
  consensus: ConsensusResult;
}> {
  console.log('🎭 Round 1: Independent Analysis...');
  const round1 = await round1_independentAnalysis(strategyDocument);

  console.log('🔄 Round 2: Cross-Review...');
  const round2 = await round2_crossReview(round1);

  console.log('💬 Round 3: Debate Conflicts...');
  const round3 = await round3_debateConflicts(round1, round2, debateTopics);

  console.log('🤝 Round 4: Build Consensus...');
  const consensus = await round4_buildConsensus(round1, round2, round3);

  return { round1, round2, round3, consensus };
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractConfidence(text: string): number {
  // Look for confidence percentage in text
  const match = text.match(/confidence[:\s]+(\d+)%/i);
  return match ? parseInt(match[1]) : 75; // Default to 75% if not found
}

function extractDecisions(text: string, category: string): any[] {
  // Simplified extraction - would use structured output in production
  const section = text.split(category)[1]?.split('##')[0] || '';
  const bullets = section.match(/- (.+)/g) || [];
  return bullets.map(b => ({
    decision: b.substring(2),
    confidence: 85 // Would parse from text in production
  }));
}

function extractDissent(text: string): any[] {
  // Simplified extraction
  const section = text.split('DISSENT')[1] || '';
  const bullets = section.match(/- (.+)/g) || [];
  return bullets.map(b => ({
    agent: 'Various',
    opinion: b.substring(2),
    reasoning: 'See full analysis'
  }));
}
