#!/usr/bin/env tsx

/**
 * Strategic Decision Framework
 * Data-driven decision making for architecture choices
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { runAudit, type ArchitectureAudit } from './phase0-audit';

interface DecisionCriteria {
  frameworkChoice: {
    current: 'express' | 'fastify' | 'mixed';
    recommendation: 'keep-express' | 'migrate-to-fastify' | 'standardize-mixed';
    confidence: number;
    reasoning: string[];
  };
  chartLibrary: {
    current: 'nivo' | 'recharts' | 'mixed';
    recommendation: 'keep-nivo' | 'keep-recharts' | 'gradual-migration';
    migrationComplexity: 'low' | 'medium' | 'high';
    reasoning: string[];
  };
  deploymentStrategy: {
    current: 'vm' | 'container' | 'serverless' | 'unknown';
    recommendation: 'stay-vm' | 'migrate-serverless' | 'containerize';
    feasibility: number;
    risks: string[];
  };
  timeline: {
    conservative: number; // days
    aggressive: number; // days
    recommended: number; // days
    criticalPath: string[];
  };
}

class StrategyDecisionMaker {
  private auditResults: ArchitectureAudit | null = null;

  async makeStrategicDecisions(): Promise<DecisionCriteria> {
    console.log('🎯 Making strategic decisions based on audit data...\n');

    // Get audit results
    this.auditResults = await runAudit();

    const decisions: DecisionCriteria = {
      frameworkChoice: await this.analyzeFrameworkChoice(),
      chartLibrary: await this.analyzeChartLibrary(),
      deploymentStrategy: await this.analyzeDeploymentStrategy(),
      timeline: await this.estimateTimeline()
    };

    return decisions;
  }

  private async analyzeFrameworkChoice(): Promise<DecisionCriteria['frameworkChoice']> {
    console.log('📋 Analyzing framework choice...');

    if (!this.auditResults) throw new Error('Audit results not available');

    const { framework } = this.auditResults;
    let recommendation: 'keep-express' | 'migrate-to-fastify' | 'standardize-mixed';
    let confidence: number;
    const reasoning: string[] = [];

    if (framework.current === 'express') {
      recommendation = 'keep-express';
      confidence = 0.9;
      reasoning.push('Express is consistently used throughout codebase');
      reasoning.push('Migration would introduce unnecessary risk');
      reasoning.push('Express ecosystem is mature and well-supported');
    } else if (framework.current === 'fastify') {
      recommendation = 'keep-express'; // Assuming Express is more common based on earlier analysis
      confidence = 0.8;
      reasoning.push('Fastify detected but Express likely more prevalent');
      reasoning.push('Should verify actual usage patterns');
    } else if (framework.current === 'mixed') {
      recommendation = 'standardize-mixed';
      confidence = 0.7;
      reasoning.push('Mixed usage creates confusion and maintenance burden');
      reasoning.push('Should standardize on most prevalent framework');
      reasoning.push('Analysis needed to determine primary framework');
    } else {
      recommendation = 'keep-express';
      confidence = 0.5;
      reasoning.push('Framework unclear from analysis');
      reasoning.push('Express is safer default choice');
    }

    console.log(`   Framework: ${framework.current} → ${recommendation} (${Math.round(confidence * 100)}% confidence)`);
    
    return {
      current: framework.current,
      recommendation,
      confidence,
      reasoning
    };
  }

  private async analyzeChartLibrary(): Promise<DecisionCriteria['chartLibrary']> {
    console.log('📊 Analyzing chart library choice...');

    if (!this.auditResults) throw new Error('Audit results not available');

    const { chartLibraries } = this.auditResults;
    let current: 'nivo' | 'recharts' | 'mixed';
    let recommendation: 'keep-nivo' | 'keep-recharts' | 'gradual-migration';
    let migrationComplexity: 'low' | 'medium' | 'high';
    const reasoning: string[] = [];

    const nivoUsage = chartLibraries.nivo.usage;
    const rechartsUsage = chartLibraries.recharts.usage;
    const totalUsage = nivoUsage + rechartsUsage;

    if (totalUsage === 0) {
      current = 'recharts'; // Default assumption
      recommendation = 'keep-recharts';
      migrationComplexity = 'low';
      reasoning.push('No clear chart library usage detected');
      reasoning.push('Recharts recommended for React ecosystem');
    } else if (nivoUsage > rechartsUsage * 2) {
      current = 'nivo';
      recommendation = 'keep-nivo';
      migrationComplexity = 'high';
      reasoning.push(`Nivo heavily used (${nivoUsage} vs ${rechartsUsage} imports)`);
      reasoning.push('Migration would be costly and risky');
    } else if (rechartsUsage > nivoUsage * 2) {
      current = 'recharts';
      recommendation = 'keep-recharts';
      migrationComplexity = 'low';
      reasoning.push(`Recharts heavily used (${rechartsUsage} vs ${nivoUsage} imports)`);
      reasoning.push('Current choice aligns with React ecosystem');
    } else {
      current = 'mixed';
      recommendation = 'gradual-migration';
      migrationComplexity = 'medium';
      reasoning.push(`Mixed usage detected (${nivoUsage} nivo, ${rechartsUsage} recharts)`);
      reasoning.push('Gradual migration to single library recommended');
      
      // Determine target based on ecosystem fit and bundle analysis
      if (this.auditResults.performance.bundleSize > 500) {
        reasoning.push('Large bundle size suggests consolidation needed');
        recommendation = 'keep-recharts'; // Assuming better tree-shaking
      }
    }

    console.log(`   Charts: ${current} → ${recommendation} (${migrationComplexity} complexity)`);
    
    return {
      current,
      recommendation,
      migrationComplexity,
      reasoning
    };
  }

  private async analyzeDeploymentStrategy(): Promise<DecisionCriteria['deploymentStrategy']> {
    console.log('🚀 Analyzing deployment strategy...');

    if (!this.auditResults) throw new Error('Audit results not available');

    let current: 'vm' | 'container' | 'serverless' | 'unknown' = 'unknown';
    let recommendation: 'stay-vm' | 'migrate-serverless' | 'containerize';
    let feasibility: number;
    const risks: string[] = [];

    // Analyze current architecture for serverless compatibility
    const hasLongRunningTasks = this.checkForLongRunningTasks();
    const hasWebSockets = this.checkForWebSockets();
    const hasStatefulSessions = this.checkForStatefulSessions();
    const databaseConnections = this.analyzeDatabaseUsage();

    // Calculate serverless feasibility
    feasibility = 1.0;
    
    if (hasLongRunningTasks) {
      feasibility -= 0.3;
      risks.push('Long-running tasks detected - may exceed serverless time limits');
    }

    if (hasWebSockets) {
      feasibility -= 0.4;
      risks.push('WebSocket usage incompatible with traditional serverless');
    }

    if (hasStatefulSessions) {
      feasibility -= 0.2;
      risks.push('Stateful sessions require session store migration');
    }

    if (databaseConnections.connectionPooling) {
      feasibility -= 0.3;
      risks.push('Connection pooling needs serverless-compatible replacement');
    }

    if (this.auditResults.performance.buildTime > 30000) {
      feasibility -= 0.2;
      risks.push('Slow build times may cause cold start issues');
    }

    // Make recommendation
    if (feasibility > 0.7) {
      recommendation = 'migrate-serverless';
      current = 'vm'; // Assumption
    } else if (feasibility > 0.4) {
      recommendation = 'containerize';
      current = 'vm';
      risks.push('Consider containerization as intermediate step');
    } else {
      recommendation = 'stay-vm';
      current = 'vm';
      risks.push('Current architecture not suitable for serverless');
    }

    console.log(`   Deployment: ${current} → ${recommendation} (${Math.round(feasibility * 100)}% feasible)`);
    
    return {
      current,
      recommendation,
      feasibility,
      risks
    };
  }

  private async estimateTimeline(): Promise<DecisionCriteria['timeline']> {
    console.log('⏱️  Estimating project timeline...');

    if (!this.auditResults) throw new Error('Audit results not available');

    let baselineDays = 15; // Conservative baseline
    const criticalPath: string[] = [];

    // Adjust based on build health
    if (this.auditResults.buildHealth.typescript === 'broken') {
      baselineDays += 2;
      criticalPath.push('Fix TypeScript compilation errors');
    }

    if (this.auditResults.buildHealth.tests === 'broken') {
      baselineDays += 3;
      criticalPath.push('Restore test suite functionality');
    }

    // Adjust based on code quality
    if (this.auditResults.codeQuality.consoleUsage > 200) {
      baselineDays += 2;
      criticalPath.push('Implement structured logging migration');
    }

    if (this.auditResults.codeQuality.testCoverage < 60) {
      baselineDays += 3;
      criticalPath.push('Improve test coverage to acceptable levels');
    }

    // Adjust based on dependencies
    if (this.auditResults.dependencies.critical.length > 0) {
      baselineDays += 1;
      criticalPath.push('Resolve critical security vulnerabilities');
    }

    // Adjust based on chart migration complexity
    const chartComplexity = this.auditResults.chartLibraries.nivo.usage + 
                           this.auditResults.chartLibraries.recharts.usage;
    if (chartComplexity > 20) {
      baselineDays += 4;
      criticalPath.push('Complete chart library migration');
    }

    // Add reserve engine implementation
    baselineDays += 5;
    criticalPath.push('Implement DeterministicReserveEngine');

    // Add Excel parity validation
    baselineDays += 3;
    criticalPath.push('Implement and validate Excel parity');

    const conservative = Math.ceil(baselineDays * 1.3); // Add 30% buffer
    const aggressive = Math.ceil(baselineDays * 0.8);   // Aggressive estimate
    const recommended = baselineDays;                   // Realistic estimate

    console.log(`   Timeline: ${aggressive}-${conservative} days (recommended: ${recommended})`);
    
    return {
      conservative,
      aggressive,
      recommended,
      criticalPath
    };
  }

  private checkForLongRunningTasks(): boolean {
    try {
      const serverFiles = this.findFiles('server/', ['.ts', '.js']);
      for (const file of serverFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('setTimeout') && content.includes('60000')) return true;
        if (content.includes('setInterval')) return true;
        if (content.includes('worker') || content.includes('queue')) return true;
      }
    } catch (error) {
      console.log(`Warning: Could not analyze long-running tasks: ${error}`);
    }
    return false;
  }

  private checkForWebSockets(): boolean {
    try {
      const allFiles = this.findFiles('.', ['.ts', '.js', '.json']);
      for (const file of allFiles) {
        if (file.includes('node_modules')) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('socket.io') || content.includes('websocket') || content.includes('ws')) {
          return true;
        }
      }
    } catch (error) {
      console.log(`Warning: Could not analyze WebSocket usage: ${error}`);
    }
    return false;
  }

  private checkForStatefulSessions(): boolean {
    try {
      const serverFiles = this.findFiles('server/', ['.ts', '.js']);
      for (const file of serverFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('express-session') || content.includes('session')) {
          return true;
        }
      }
    } catch (error) {
      console.log(`Warning: Could not analyze session usage: ${error}`);
    }
    return false;
  }

  private analyzeDatabaseUsage(): { connectionPooling: boolean; longQueries: boolean } {
    try {
      const dbFiles = this.findFiles('server/', ['.ts', '.js']).filter(f => 
        f.includes('db') || f.includes('database') || f.includes('drizzle')
      );
      
      let connectionPooling = false;
      let longQueries = false;

      for (const file of dbFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('pool') || content.includes('connection')) {
          connectionPooling = true;
        }
        if (content.includes('transaction') || content.includes('lock')) {
          longQueries = true;
        }
      }

      return { connectionPooling, longQueries };
    } catch (error) {
      console.log(`Warning: Could not analyze database usage: ${error}`);
      return { connectionPooling: false, longQueries: false };
    }
  }

  private findFiles(directory: string, extensions: string[]): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const fullPath = `${directory}/${item}`;
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          files.push(...this.findFiles(fullPath, extensions));
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
    
    return files;
  }
}

export async function makeStrategicDecisions(): Promise<DecisionCriteria> {
  const decisionMaker = new StrategyDecisionMaker();
  return await decisionMaker.makeStrategicDecisions();
}

// CLI execution
if (require.main === module) {
  makeStrategicDecisions().then(decisions => {
    console.log('\n🎯 STRATEGIC DECISIONS COMPLETE\n');
    console.log('='.repeat(60));
    
    console.log('\n📋 FRAMEWORK DECISION:');
    console.log(`   Current: ${decisions.frameworkChoice.current}`);
    console.log(`   Recommendation: ${decisions.frameworkChoice.recommendation}`);
    console.log(`   Confidence: ${Math.round(decisions.frameworkChoice.confidence * 100)}%`);
    console.log('   Reasoning:');
    decisions.frameworkChoice.reasoning.forEach(reason => {
      console.log(`   - ${reason}`);
    });

    console.log('\n📊 CHART LIBRARY DECISION:');
    console.log(`   Current: ${decisions.chartLibrary.current}`);
    console.log(`   Recommendation: ${decisions.chartLibrary.recommendation}`);
    console.log(`   Migration Complexity: ${decisions.chartLibrary.migrationComplexity}`);
    console.log('   Reasoning:');
    decisions.chartLibrary.reasoning.forEach(reason => {
      console.log(`   - ${reason}`);
    });

    console.log('\n🚀 DEPLOYMENT STRATEGY:');
    console.log(`   Current: ${decisions.deploymentStrategy.current}`);
    console.log(`   Recommendation: ${decisions.deploymentStrategy.recommendation}`);
    console.log(`   Feasibility: ${Math.round(decisions.deploymentStrategy.feasibility * 100)}%`);
    if (decisions.deploymentStrategy.risks.length > 0) {
      console.log('   Risks:');
      decisions.deploymentStrategy.risks.forEach(risk => {
        console.log(`   - ${risk}`);
      });
    }

    console.log('\n⏱️  TIMELINE ESTIMATE:');
    console.log(`   Conservative: ${decisions.timeline.conservative} days`);
    console.log(`   Recommended: ${decisions.timeline.recommended} days`);
    console.log(`   Aggressive: ${decisions.timeline.aggressive} days`);
    console.log('   Critical Path:');
    decisions.timeline.criticalPath.forEach(item => {
      console.log(`   - ${item}`);
    });

    console.log('\n💾 Saving decisions to strategic-decisions.json...');
    fs.writeFileSync('strategic-decisions.json', JSON.stringify(decisions, null, 2));
    
    console.log('\n✅ Strategic analysis complete - proceed to Phase 1');
  }).catch(error => {
    console.error('❌ Strategic decisions failed:', error);
    process.exit(1);
  });
}