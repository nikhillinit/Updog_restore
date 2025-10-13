/**
 * Multi-Agent Debate & Iterative Refinement
 *
 * Inspired by:
 * - Multi-Agents-Debate: https://github.com/Skytliang/Multi-Agents-Debate
 * - Chain-of-Thought + Self-Critique patterns
 *
 * Workflow:
 * 1. Main model proposes initial solution (step-by-step reasoning)
 * 2. Critic model evaluates and provides detailed feedback
 * 3. Main model refines solution based on feedback
 * 4. Repeat for N iterations
 * 5. Judge model compares all iterations and selects best
 */

import { askAI, type AIProvider } from './portkey-ai.js';

// ============================================================================
// Iterative Refinement Workflow
// ============================================================================

export interface RefinementConfig {
  mainModel: AIProvider;
  criticModel: AIProvider;
  judgeModel: AIProvider;
  iterations: number;
  enableDebate?: boolean;
}

export interface RefinementRound {
  round: number;
  proposal: {
    model: AIProvider;
    reasoning: string;
    solution: string;
    confidence: number;
  };
  critique?: {
    model: AIProvider;
    feedback: string;
    scores: {
      correctness: number;
      clarity: number;
      completeness: number;
    };
    improvementSuggestions: string[];
  };
}

export interface RefinementResult {
  rounds: RefinementRound[];
  finalSolution: {
    solution: string;
    reasoning: string;
    round: number;
    confidence: number;
  };
  judgement: {
    model: AIProvider;
    selectedRound: number;
    rationale: string;
    scores: Record<number, number>;
  };
  metrics: {
    totalIterations: number;
    improvementRate: number;
    consensusReached: boolean;
  };
}

/**
 * Iterative refinement with debate
 */
export async function iterativeRefinement(
  problem: string,
  context: string,
  config: RefinementConfig = {
    mainModel: 'anthropic',
    criticModel: 'openai',
    judgeModel: 'google',
    iterations: 5,
    enableDebate: true
  }
): Promise<RefinementResult> {
  const rounds: RefinementRound[] = [];

  let previousSolution: string | undefined;
  let previousFeedback: string | undefined;

  // Iterative refinement loop
  for (let i = 0; i < config.iterations; i++) {
    console.log(`[Refinement] Round ${i + 1}/${config.iterations}`);

    // Step 1: Main model proposes solution
    const proposalPrompt = buildProposalPrompt(
      problem,
      context,
      i,
      previousSolution,
      previousFeedback
    );

    const proposalResult = await askAI(
      config.mainModel,
      proposalPrompt,
      undefined,
      {
        includeProjectContext: false,
        systemContext: 'You are solving a complex problem step-by-step. Show your reasoning.'
      }
    );

    const round: RefinementRound = {
      round: i + 1,
      proposal: {
        model: config.mainModel,
        reasoning: extractReasoning(proposalResult.text),
        solution: extractSolution(proposalResult.text),
        confidence: extractConfidence(proposalResult.text)
      }
    };

    // Step 2: Critic model evaluates (except last round)
    if (i < config.iterations - 1) {
      const critiquePrompt = buildCritiquePrompt(
        problem,
        context,
        round.proposal.solution,
        round.proposal.reasoning
      );

      const critiqueResult = await askAI(
        config.criticModel,
        critiquePrompt,
        undefined,
        {
          includeProjectContext: false,
          systemContext: 'You are a critic evaluating proposed solutions. Be thorough and constructive.'
        }
      );

      round.critique = {
        model: config.criticModel,
        feedback: critiqueResult.text,
        scores: extractScores(critiqueResult.text),
        improvementSuggestions: extractSuggestions(critiqueResult.text)
      };

      previousSolution = round.proposal.solution;
      previousFeedback = round.critique.feedback;
    }

    rounds.push(round);
  }

  // Step 3: Judge selects best solution
  const judgementPrompt = buildJudgementPrompt(problem, rounds);

  const judgementResult = await askAI(
    config.judgeModel,
    judgementPrompt,
    undefined,
    {
      includeProjectContext: false,
      systemContext: 'You are a judge comparing multiple solutions. Select the best one based on evidence.'
    }
  );

  const selectedRound = extractSelectedRound(judgementResult.text, rounds.length);
  const bestRound = rounds[selectedRound - 1];

  return {
    rounds,
    finalSolution: {
      solution: bestRound.proposal.solution,
      reasoning: bestRound.proposal.reasoning,
      round: selectedRound,
      confidence: bestRound.proposal.confidence
    },
    judgement: {
      model: config.judgeModel,
      selectedRound,
      rationale: extractRationale(judgementResult.text),
      scores: extractAllScores(judgementResult.text, rounds.length)
    },
    metrics: {
      totalIterations: config.iterations,
      improvementRate: calculateImprovementRate(rounds),
      consensusReached: checkConsensus(rounds)
    }
  };
}

// ============================================================================
// Multi-Agent Debate Workflow
// ============================================================================

export interface DebateConfig {
  agents: Array<{
    name: string;
    model: AIProvider;
    perspective: string;
  }>;
  rounds: number;
  judgeModel: AIProvider;
}

export interface DebateRound {
  round: number;
  arguments: Array<{
    agent: string;
    model: AIProvider;
    position: string;
    evidence: string[];
    rebuttals?: string[];
  }>;
}

export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  consensus: {
    reached: boolean;
    position: string;
    supportingAgents: string[];
    dissentingAgents: string[];
  };
  judgement: {
    winner: string;
    rationale: string;
    votes: Record<string, number>;
  };
}

/**
 * Multi-agent debate (inspired by Multi-Agents-Debate)
 */
export async function multiAgentDebate(
  topic: string,
  context: string,
  config: DebateConfig = {
    agents: [
      { name: 'Affirmative', model: 'anthropic', perspective: 'Argue FOR the proposition' },
      { name: 'Negative', model: 'openai', perspective: 'Argue AGAINST the proposition' },
      { name: 'Neutral', model: 'google', perspective: 'Provide balanced analysis' }
    ],
    rounds: 3,
    judgeModel: 'deepseek'
  }
): Promise<DebateResult> {
  const rounds: DebateRound[] = [];

  // Debate rounds
  for (let r = 0; r < config.rounds; r++) {
    console.log(`[Debate] Round ${r + 1}/${config.rounds}`);

    const debateRound: DebateRound = {
      round: r + 1,
      arguments: []
    };

    // Previous arguments for rebuttal
    const previousRound = rounds[r - 1];

    // Each agent makes their argument
    for (const agent of config.agents) {
      const argumentPrompt = buildDebateArgumentPrompt(
        topic,
        context,
        agent,
        r,
        previousRound
      );

      const argumentResult = await askAI(
        agent.model,
        argumentPrompt,
        undefined,
        {
          includeProjectContext: false,
          systemContext: `You are ${agent.name}. ${agent.perspective}`
        }
      );

      debateRound.arguments.push({
        agent: agent.name,
        model: agent.model,
        position: extractPosition(argumentResult.text),
        evidence: extractEvidence(argumentResult.text),
        rebuttals: r > 0 ? extractRebuttals(argumentResult.text) : undefined
      });
    }

    rounds.push(debateRound);
  }

  // Check for consensus
  const consensus = analyzeConsensus(rounds, config.agents);

  // Judge determines winner
  const judgementPrompt = buildDebateJudgementPrompt(topic, rounds, config.agents);

  const judgementResult = await askAI(
    config.judgeModel,
    judgementPrompt,
    undefined,
    {
      includeProjectContext: false,
      systemContext: 'You are a neutral judge evaluating a debate. Base your decision on evidence and logic.'
    }
  );

  return {
    topic,
    rounds,
    consensus,
    judgement: {
      winner: extractWinner(judgementResult.text, config.agents),
      rationale: extractRationale(judgementResult.text),
      votes: extractVotes(judgementResult.text, config.agents)
    }
  };
}

// ============================================================================
// Prompt Builders
// ============================================================================

function buildProposalPrompt(
  problem: string,
  context: string,
  round: number,
  previousSolution?: string,
  previousFeedback?: string
): string {
  let prompt = `Solve this problem step-by-step:

Problem: ${problem}

Context: ${context}

Requirements:
1. List relevant knowledge points
2. Write down your initial thought process
3. Expand on the specific calculation/reasoning process (don't skip steps)
4. Give the final result
5. State your confidence level (0-100%)

Format your response as:
## Knowledge Points
- ...

## Thought Process
...

## Detailed Reasoning
...

## Solution
...

## Confidence: X%
`;

  if (round > 0 && previousSolution && previousFeedback) {
    prompt += `\n\nPrevious attempt (Round ${round}):
Solution: ${previousSolution}

Feedback received:
${previousFeedback}

Please refine your solution based on this feedback.`;
  }

  return prompt;
}

function buildCritiquePrompt(
  problem: string,
  context: string,
  solution: string,
  reasoning: string
): string {
  return `Evaluate this proposed solution:

Problem: ${problem}
Context: ${context}

Proposed Solution:
${solution}

Reasoning:
${reasoning}

Provide detailed feedback:
1. Overview: Check for obvious flaws and give initial feedback
2. Correctness: Carefully check the reasoning process for errors
3. Logic: Evaluate whether the reasoning is rigorous
4. Clarity: Assess how well the solution is explained
5. Completeness: Identify any missing considerations

Format as:
## Overview
...

## Correctness Score: X/10
...

## Clarity Score: X/10
...

## Completeness Score: X/10
...

## Improvement Suggestions
- ...

## Overall Feedback
...
`;
}

function buildJudgementPrompt(problem: string, rounds: RefinementRound[]): string {
  const solutions = rounds.map((r, idx) => `
Round ${idx + 1}:
Solution: ${r.proposal.solution}
Reasoning: ${r.proposal.reasoning.substring(0, 300)}...
${r.critique ? `Critique Score: ${(r.critique.scores.correctness + r.critique.scores.clarity + r.critique.scores.completeness) / 3}/10` : ''}
`).join('\n\n');

  return `Compare these ${rounds.length} solutions to the problem:

Problem: ${problem}

Solutions:
${solutions}

Your task:
1. Score each solution on correctness, clarity, and completeness (1-10 each)
2. Select the BEST solution overall
3. Explain your rationale

Format as:
## Scores
Round 1: X/10
Round 2: Y/10
...

## Selected: Round X

## Rationale
...
`;
}

function buildDebateArgumentPrompt(
  topic: string,
  context: string,
  agent: { name: string; perspective: string },
  round: number,
  previousRound?: DebateRound
): string {
  let prompt = `Debate Topic: ${topic}

Context: ${context}

Your perspective: ${agent.perspective}

Round ${round + 1}: Present your argument with:
1. Clear position statement
2. Supporting evidence (cite specific points)
3. Logical reasoning
`;

  if (round > 0 && previousRound) {
    const otherArguments = previousRound.arguments
      .filter(a => a.agent !== agent.name)
      .map(a => `${a.agent}: ${a.position}`)
      .join('\n');

    prompt += `\nOpposing arguments from previous round:
${otherArguments}

4. Rebuttals to opposing arguments

Format as:
## Position
...

## Evidence
- ...

## Reasoning
...

## Rebuttals
- ...
`;
  } else {
    prompt += `\nFormat as:
## Position
...

## Evidence
- ...

## Reasoning
...
`;
  }

  return prompt;
}

function buildDebateJudgementPrompt(
  topic: string,
  rounds: DebateRound[],
  agents: Array<{ name: string }>
): string {
  const transcript = rounds.map(r => `
Round ${r.round}:
${r.arguments.map(a => `  ${a.agent}: ${a.position}`).join('\n')}
`).join('\n');

  return `Judge this debate:

Topic: ${topic}

Transcript:
${transcript}

Evaluate each participant on:
1. Quality of evidence
2. Logical consistency
3. Effective rebuttals
4. Overall persuasiveness

Determine the winner and explain why.

Format as:
## Votes
${agents.map(a => `${a.name}: X/10`).join('\n')}

## Winner: [Agent Name]

## Rationale
...
`;
}

// ============================================================================
// Extractors
// ============================================================================

function extractReasoning(text: string): string {
  const match = text.match(/## (?:Detailed )?Reasoning([\s\S]*?)(?=##|$)/i);
  return match ? match[1].trim() : text.substring(0, 500);
}

function extractSolution(text: string): string {
  const match = text.match(/## Solution([\s\S]*?)(?=##|$)/i);
  return match ? match[1].trim() : text.substring(0, 300);
}

function extractConfidence(text: string): number {
  const match = text.match(/confidence[:\s]+(\d+)%/i);
  return match ? parseInt(match[1]) : 75;
}

function extractScores(text: string): { correctness: number; clarity: number; completeness: number } {
  const correctness = text.match(/correctness[:\s]+(\d+)\/10/i);
  const clarity = text.match(/clarity[:\s]+(\d+)\/10/i);
  const completeness = text.match(/completeness[:\s]+(\d+)\/10/i);

  return {
    correctness: correctness ? parseInt(correctness[1]) : 7,
    clarity: clarity ? parseInt(clarity[1]) : 7,
    completeness: completeness ? parseInt(completeness[1]) : 7
  };
}

function extractSuggestions(text: string): string[] {
  const section = text.split(/improvement suggestions?/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractSelectedRound(text: string, maxRounds: number): number {
  const match = text.match(/selected[:\s]+round\s+(\d+)/i);
  if (match) {
    const round = parseInt(match[1]);
    return round >= 1 && round <= maxRounds ? round : maxRounds;
  }
  return maxRounds; // Default to last round
}

function extractRationale(text: string): string {
  const match = text.match(/## Rationale([\s\S]*?)(?=##|$)/i);
  return match ? match[1].trim() : '';
}

function extractAllScores(text: string, numRounds: number): Record<number, number> {
  const scores: Record<number, number> = {};
  for (let i = 1; i <= numRounds; i++) {
    const match = text.match(new RegExp(`round ${i}[:\\s]+(\\d+)\/10`, 'i'));
    scores[i] = match ? parseInt(match[1]) : 5;
  }
  return scores;
}

function extractPosition(text: string): string {
  const match = text.match(/## Position([\s\S]*?)(?=##|$)/i);
  return match ? match[1].trim() : text.substring(0, 200);
}

function extractEvidence(text: string): string[] {
  const section = text.split(/## Evidence/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractRebuttals(text: string): string[] {
  const section = text.split(/## Rebuttals/i)[1]?.split('##')[0] || '';
  return (section.match(/^[-*]\s+(.+)$/gm) || []).map(s => s.substring(2).trim());
}

function extractWinner(text: string, agents: Array<{ name: string }>): string {
  const match = text.match(/## Winner[:\s]+(.+?)(?=\n|$)/i);
  if (match) {
    const winner = match[1].trim();
    // Find matching agent name
    const agent = agents.find(a => winner.toLowerCase().includes(a.name.toLowerCase()));
    return agent?.name || agents[0].name;
  }
  return agents[0].name;
}

function extractVotes(text: string, agents: Array<{ name: string }>): Record<string, number> {
  const votes: Record<string, number> = {};
  agents.forEach(agent => {
    const match = text.match(new RegExp(`${agent.name}[:\\s]+(\\d+)\/10`, 'i'));
    votes[agent.name] = match ? parseInt(match[1]) : 5;
  });
  return votes;
}

// ============================================================================
// Helpers
// ============================================================================

function calculateImprovementRate(rounds: RefinementRound[]): number {
  if (rounds.length < 2) return 0;

  const scoresWithCritique = rounds
    .filter(r => r.critique)
    .map(r => {
      const scores = r.critique!.scores;
      return (scores.correctness + scores.clarity + scores.completeness) / 3;
    });

  if (scoresWithCritique.length < 2) return 0;

  const firstScore = scoresWithCritique[0];
  const lastScore = scoresWithCritique[scoresWithCritique.length - 1];

  return ((lastScore - firstScore) / firstScore) * 100;
}

function checkConsensus(rounds: RefinementRound[]): boolean {
  if (rounds.length < 2) return false;

  // Check if last 2 rounds have high confidence and similar solutions
  const lastTwoRounds = rounds.slice(-2);
  const confidences = lastTwoRounds.map(r => r.proposal.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  return avgConfidence >= 85; // High confidence indicates convergence
}

function analyzeConsensus(
  rounds: DebateRound[],
  agents: Array<{ name: string }>
): {
  reached: boolean;
  position: string;
  supportingAgents: string[];
  dissentingAgents: string[];
} {
  if (rounds.length === 0) {
    return {
      reached: false,
      position: '',
      supportingAgents: [],
      dissentingAgents: []
    };
  }

  const lastRound = rounds[rounds.length - 1];

  // Simple consensus detection: check if positions converge
  const positions = lastRound.arguments.map(a => a.position.toLowerCase());

  // Count similar positions (naive similarity)
  const positionCounts: Record<string, string[]> = {};

  positions.forEach((pos, idx) => {
    const agent = lastRound.arguments[idx].agent;
    const key = pos.substring(0, 100); // Use first 100 chars as key

    if (!positionCounts[key]) {
      positionCounts[key] = [];
    }
    positionCounts[key].push(agent);
  });

  // Find majority position
  let majorityPosition = '';
  let majorityAgents: string[] = [];

  Object.entries(positionCounts).forEach(([pos, ags]) => {
    if (ags.length > majorityAgents.length) {
      majorityPosition = pos;
      majorityAgents = ags;
    }
  });

  const reached = majorityAgents.length >= Math.ceil(agents.length * 0.66); // 2/3 majority

  return {
    reached,
    position: majorityPosition,
    supportingAgents: majorityAgents,
    dissentingAgents: agents
      .map(a => a.name)
      .filter(name => !majorityAgents.includes(name))
  };
}
