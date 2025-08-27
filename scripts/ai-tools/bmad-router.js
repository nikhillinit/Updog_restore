/**
 * BMAD Intelligent Router
 * Routes issues to appropriate agents based on classification and confidence
 */

import { BMAD_CONFIG, classifyIssue, isProtectedPath, isSafePath, getAgentConfig } from './bmad-config.js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Track PR creation to enforce limits
const prTracker = {
  daily: new Map(),
  weekly: new Map()
};

// Reset trackers at appropriate intervals
setInterval(() => {
  const now = new Date();
  // Reset daily at midnight
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    prTracker.daily.clear();
  }
  // Reset weekly on Sunday at midnight
  if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) {
    prTracker.weekly.clear();
  }
}, 60000); // Check every minute

export class BMADRouter {
  constructor() {
    this.routingHistory = new Map();
    this.agentPerformance = new Map();
  }
  
  /**
   * Route an issue to the appropriate agent
   */
  async route(issue) {
    const routing = {
      issueId: this.generateIssueId(issue),
      timestamp: new Date().toISOString(),
      issue: issue,
      classification: null,
      agent: null,
      confidence: 0,
      decision: null,
      reasons: []
    };
    
    // Step 1: Check if we've hit rate limits
    const rateLimitCheck = this.checkRateLimits();
    if (!rateLimitCheck.allowed) {
      routing.decision = 'BLOCKED';
      routing.reasons.push(`Rate limit exceeded: ${rateLimitCheck.reason}`);
      routing.agent = 'manual-triage';
      return routing;
    }
    
    // Step 2: Classify the issue
    const classification = classifyIssue(issue.errorMessage || issue.description);
    routing.classification = classification;
    routing.confidence = classification.confidence;
    
    // Step 3: Check file paths for protection level
    const pathChecks = await this.checkFilePaths(issue.files || []);
    
    if (pathChecks.hasProtected) {
      routing.decision = 'REQUIRES_APPROVAL';
      routing.reasons.push('Contains protected paths requiring CODEOWNER approval');
      routing.agent = 'manual-triage';
      
      // Add protected path details
      routing.protectedPaths = pathChecks.protectedPaths;
      return routing;
    }
    
    // Step 4: Check confidence threshold
    if (classification.confidence < BMAD_CONFIG.limits.confidenceThreshold) {
      routing.decision = 'LOW_CONFIDENCE';
      routing.reasons.push(`Confidence ${classification.confidence.toFixed(2)} below threshold ${BMAD_CONFIG.limits.confidenceThreshold}`);
      routing.agent = 'manual-triage';
      return routing;
    }
    
    // Step 5: Check if all paths are safe
    if (!pathChecks.allSafe) {
      routing.decision = 'MIXED_PATHS';
      routing.reasons.push('Contains paths outside safe zones');
      routing.confidence *= 0.8; // Reduce confidence for mixed paths
    }
    
    // Step 6: Check agent availability and performance
    const agent = classification.agent;
    const agentConfig = getAgentConfig(agent);
    const agentPerf = this.getAgentPerformance(agent);
    
    if (agentPerf.recentFailures > 3) {
      routing.decision = 'AGENT_UNRELIABLE';
      routing.reasons.push(`Agent ${agent} has ${agentPerf.recentFailures} recent failures`);
      routing.agent = 'manual-triage';
      return routing;
    }
    
    // Step 7: Check issue complexity
    const complexity = this.assessComplexity(issue);
    if (complexity.score > 0.8) {
      routing.decision = 'HIGH_COMPLEXITY';
      routing.reasons.push('Issue complexity exceeds autonomous threshold');
      routing.confidence *= 0.7;
      
      if (routing.confidence < BMAD_CONFIG.limits.confidenceThreshold) {
        routing.agent = 'manual-triage';
        return routing;
      }
    }
    
    // Step 8: Route to agent
    routing.agent = agent;
    routing.decision = 'ROUTED';
    routing.reasons.push(`Routed to ${agent} with confidence ${routing.confidence.toFixed(2)}`);
    
    // Record routing decision
    this.recordRouting(routing);
    
    return routing;
  }
  
  /**
   * Check rate limits
   */
  checkRateLimits() {
    const today = new Date().toDateString();
    const week = this.getWeekNumber(new Date());
    
    const dailyCount = prTracker.daily.get(today) || 0;
    const weeklyCount = prTracker.weekly.get(week) || 0;
    
    if (dailyCount >= BMAD_CONFIG.limits.maxPRsPerDay) {
      return { allowed: false, reason: `Daily limit (${BMAD_CONFIG.limits.maxPRsPerDay}) reached` };
    }
    
    if (weeklyCount >= BMAD_CONFIG.limits.maxPRsPerWeek) {
      return { allowed: false, reason: `Weekly limit (${BMAD_CONFIG.limits.maxPRsPerWeek}) reached` };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check file paths for protection status
   */
  async checkFilePaths(files) {
    const result = {
      hasProtected: false,
      protectedPaths: [],
      safePaths: [],
      unknownPaths: [],
      allSafe: true
    };
    
    for (const file of files) {
      if (isProtectedPath(file)) {
        result.hasProtected = true;
        result.protectedPaths.push(file);
        result.allSafe = false;
      } else if (isSafePath(file)) {
        result.safePaths.push(file);
      } else {
        result.unknownPaths.push(file);
        result.allSafe = false;
      }
    }
    
    return result;
  }
  
  /**
   * Assess issue complexity
   */
  assessComplexity(issue) {
    const factors = {
      fileCount: (issue.files?.length || 0) / 10,
      errorLength: Math.min((issue.errorMessage?.length || 0) / 1000, 1),
      stackDepth: Math.min((issue.stackTrace?.split('\n').length || 0) / 20, 1),
      hasMultipleErrors: issue.errors?.length > 1 ? 0.3 : 0,
      crossPackage: issue.files?.some(f => f.includes('node_modules')) ? 0.2 : 0,
      hasMigration: issue.files?.some(f => f.includes('migration')) ? 0.3 : 0
    };
    
    const score = Object.values(factors).reduce((sum, val) => sum + val, 0) / Object.keys(factors).length;
    
    return {
      score,
      factors,
      level: score > 0.8 ? 'high' : score > 0.5 ? 'medium' : 'low'
    };
  }
  
  /**
   * Get agent performance metrics
   */
  getAgentPerformance(agentName) {
    if (!this.agentPerformance.has(agentName)) {
      this.agentPerformance.set(agentName, {
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
        recentFailures: 0,
        averageTime: 0,
        lastRun: null
      });
    }
    
    return this.agentPerformance.get(agentName);
  }
  
  /**
   * Record routing decision
   */
  recordRouting(routing) {
    this.routingHistory.set(routing.issueId, routing);
    
    // Prune old history (keep last 1000)
    if (this.routingHistory.size > 1000) {
      const oldest = this.routingHistory.keys().next().value;
      this.routingHistory.delete(oldest);
    }
  }
  
  /**
   * Update agent performance after run
   */
  updateAgentPerformance(agentName, result) {
    const perf = this.getAgentPerformance(agentName);
    
    perf.totalRuns++;
    perf.lastRun = new Date().toISOString();
    
    if (result.success) {
      perf.successCount++;
      perf.recentFailures = 0;
    } else {
      perf.failureCount++;
      perf.recentFailures++;
    }
    
    // Update average time
    const currentAvg = perf.averageTime;
    const newTime = result.duration || 0;
    perf.averageTime = (currentAvg * (perf.totalRuns - 1) + newTime) / perf.totalRuns;
    
    // Update PR tracker if PR was created
    if (result.prCreated) {
      const today = new Date().toDateString();
      const week = this.getWeekNumber(new Date());
      
      prTracker.daily.set(today, (prTracker.daily.get(today) || 0) + 1);
      prTracker.weekly.set(week, (prTracker.weekly.get(week) || 0) + 1);
    }
  }
  
  /**
   * Generate unique issue ID
   */
  generateIssueId(issue) {
    const content = JSON.stringify({
      error: issue.errorMessage,
      files: issue.files?.sort(),
      type: issue.type
    });
    
    return createHash('md5').update(content).digest('hex').substring(0, 8);
  }
  
  /**
   * Get week number
   */
  getWeekNumber(date) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - firstDay) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + firstDay.getDay() + 1) / 7);
  }
  
  /**
   * Get routing statistics
   */
  getStatistics() {
    const stats = {
      totalRoutings: this.routingHistory.size,
      byDecision: {},
      byAgent: {},
      byConfidence: {
        high: 0,    // > 0.8
        medium: 0,  // 0.6 - 0.8
        low: 0      // < 0.6
      },
      averageConfidence: 0,
      recentActivity: []
    };
    
    let totalConfidence = 0;
    
    for (const routing of this.routingHistory.values()) {
      // By decision
      stats.byDecision[routing.decision] = (stats.byDecision[routing.decision] || 0) + 1;
      
      // By agent
      stats.byAgent[routing.agent] = (stats.byAgent[routing.agent] || 0) + 1;
      
      // By confidence
      if (routing.confidence > 0.8) stats.byConfidence.high++;
      else if (routing.confidence >= 0.6) stats.byConfidence.medium++;
      else stats.byConfidence.low++;
      
      totalConfidence += routing.confidence;
    }
    
    stats.averageConfidence = totalConfidence / Math.max(this.routingHistory.size, 1);
    
    // Get last 10 routings
    const routings = Array.from(this.routingHistory.values());
    stats.recentActivity = routings.slice(-10).reverse();
    
    // Add agent performance
    stats.agentPerformance = {};
    for (const [agent, perf] of this.agentPerformance.entries()) {
      stats.agentPerformance[agent] = {
        successRate: perf.successCount / Math.max(perf.totalRuns, 1),
        averageTime: perf.averageTime,
        recentFailures: perf.recentFailures,
        lastRun: perf.lastRun
      };
    }
    
    return stats;
  }
  
  /**
   * Export routing history for analysis
   */
  async exportHistory(filepath) {
    const data = {
      exportDate: new Date().toISOString(),
      config: {
        confidenceThreshold: BMAD_CONFIG.limits.confidenceThreshold,
        maxPRsPerWeek: BMAD_CONFIG.limits.maxPRsPerWeek,
        maxPRsPerDay: BMAD_CONFIG.limits.maxPRsPerDay
      },
      statistics: this.getStatistics(),
      history: Array.from(this.routingHistory.values())
    };
    
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`Routing history exported to ${filepath}`);
  }
}

// Singleton instance
export const router = new BMADRouter();

export default router;