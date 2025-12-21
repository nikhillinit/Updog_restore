import type { AgentExecutionContext } from '@agent-core/BaseAgent';
import { BaseAgent } from '@agent-core/BaseAgent';
import { withThinking } from '@agent-core/ThinkingMixin';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as zlib from 'zlib';

const execAsync = promisify(exec);
const gzip = promisify(zlib.gzip);

export interface BundleOptimizationInput {
  targetSizeKB: number;
  preserveFunctionality: boolean;
  strategy?: 'aggressive' | 'safe' | 'balanced';
  excludePatterns?: string[];
  rollbackOnFailure?: boolean;
}

export interface BundleAnalysis {
  currentSizeKB: number;
  targetSizeKB: number;
  chunks: ChunkInfo[];
  recommendations: OptimizationRecommendation[];
  estimatedSavingsKB: number;
}

interface ChunkInfo {
  name: string;
  sizeKB: number;
  gzippedKB: number;
  modules: string[];
  isVendor: boolean;
  canBeLazyLoaded: boolean;
}

interface OptimizationRecommendation {
  type: 'lazy-load' | 'remove-dep' | 'replace-dep' | 'tree-shake' | 'code-split';
  description: string;
  estimatedSavingsKB: number;
  risk: 'low' | 'medium' | 'high';
  implementation: string;
}

export class BundleOptimizationAgent extends withThinking(BaseAgent)<BundleOptimizationInput, BundleAnalysis> {
  constructor() {
    super({
      name: 'BundleOptimizationAgent',
      maxRetries: 2,
      retryDelay: 2000,
      timeout: 120000,
      logLevel: 'info',

      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'agent:bundle-optimization',
      memoryScope: 'project', // Learn optimization patterns across builds
    });
  }

  protected async performOperation(
    input: BundleOptimizationInput,
    context: AgentExecutionContext
  ): Promise<BundleAnalysis> {
    this.logger.info('Starting bundle optimization analysis', { input });

    // Build the project first to get accurate bundle sizes
    await this.buildProject();

    // Analyze current bundle
    const currentAnalysis = await this.analyzeBundle();
    
    // Generate optimization recommendations
    const recommendations = await this.generateRecommendations(
      currentAnalysis,
      input
    );

    // Calculate estimated savings
    const estimatedSavingsKB = recommendations.reduce(
      (sum, rec) => sum + rec.estimatedSavingsKB,
      0
    );

    const analysis: BundleAnalysis = {
      currentSizeKB: currentAnalysis.totalSizeKB,
      targetSizeKB: input.targetSizeKB,
      chunks: currentAnalysis.chunks,
      recommendations,
      estimatedSavingsKB,
    };

    // If aggressive mode, attempt to apply optimizations
    if (input.strategy === 'aggressive' && input.preserveFunctionality) {
      await this.applyOptimizations(recommendations, input);
    }

    return analysis;
  }

  private async buildProject(): Promise<void> {
    this.logger.info('Building project for analysis');
    try {
      await execAsync('npm run build');
    } catch (error) {
      this.logger.warn('Build failed, continuing with existing bundle', { error });
    }
  }

  private async analyzeBundle(): Promise<{ totalSizeKB: number; chunks: ChunkInfo[] }> {
    const distPath = path.resolve('dist/public/assets');
    let totalSize = 0;
    const chunks: ChunkInfo[] = [];

    if (!fs.existsSync(distPath)) {
      throw new Error('Build directory not found. Please build the project first.');
    }

    const files = fs.readdirSync(distPath);
    
    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.css')) continue;

      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath);
      const gzipped = await gzip(content);

      const chunkInfo: ChunkInfo = {
        name: file,
        sizeKB: Math.round(stats.size / 1024),
        gzippedKB: Math.round(gzipped.length / 1024),
        modules: this.extractModules(content.toString()),
        isVendor: file.includes('vendor'),
        canBeLazyLoaded: this.canBeLazyLoaded(file, content.toString()),
      };

      chunks.push(chunkInfo);
      totalSize += chunkInfo.gzippedKB;
    }

    return { totalSizeKB: totalSize, chunks };
  }

  private extractModules(content: string): string[] {
    const modules: string[] = [];
    const modulePattern = /from\s+["']([^"']+)["']/g;
    const matches = content.matchAll(modulePattern);
    
    for (const match of matches) {
      if (match[1] && !modules.includes(match[1])) {
        modules.push(match[1]);
      }
    }

    return modules.slice(0, 10); // Return top 10 modules
  }

  private canBeLazyLoaded(filename: string, content: string): boolean {
    // Don't lazy load main entry or critical vendor chunks
    if (filename.includes('index') || filename.includes('vendor-react')) {
      return false;
    }

    // Check if it's a route-based chunk
    if (filename.includes('planning') || filename.includes('analytics')) {
      return true;
    }

    // Check for chart libraries (good candidates for lazy loading)
    if (content.includes('recharts') || content.includes('nivo')) {
      return true;
    }

    return false;
  }

  private async generateRecommendations(
    analysis: { totalSizeKB: number; chunks: ChunkInfo[] },
    input: BundleOptimizationInput
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    const sizeDelta = analysis.totalSizeKB - input.targetSizeKB;

    if (sizeDelta <= 0) {
      this.logger.info('Bundle already meets target size');
      return recommendations;
    }

    try {
      // Use extended thinking for complex optimization strategy
      const strategy = await this.think(
        `Analyze bundle and suggest optimizations:

Current size: ${analysis.totalSizeKB}KB
Target size: ${input.targetSizeKB}KB
Delta: ${sizeDelta}KB
Chunks: ${analysis.chunks.length}

Largest chunks:
${analysis.chunks.slice(0, 5).map(c => `- ${c.name}: ${c.gzippedKB}KB`).join('\n')}

Suggest specific, actionable optimization strategies.`,
        {
          depth: sizeDelta > 100 ? 'deep' : 'quick',
          context: 'Vite build system, React SPA, modern browser targets'
        }
      );

      // Parse AI recommendations and merge with heuristic-based ones
      this.logger.info('Extended thinking provided optimization strategy', {
        thinking_blocks: strategy.thinking.length,
        cost: strategy.cost?.total_cost_usd
      });
    } catch (error) {
      this.logger.warn('Extended thinking failed, using heuristic analysis', { error });
    }

    // Analyze for heavy dependencies
    const vendorChunks = analysis.chunks.filter(c => c.isVendor);
    for (const chunk of vendorChunks) {
      if (chunk.gzippedKB > 50) {
        recommendations.push({
          type: 'code-split',
          description: `Split ${chunk.name} into smaller chunks`,
          estimatedSavingsKB: Math.round(chunk.gzippedKB * 0.2),
          risk: 'low',
          implementation: `Add to vite.config.ts manualChunks`,
        });
      }
    }

    // Check for lazy loading opportunities
    const lazyLoadCandidates = analysis.chunks.filter(c => c.canBeLazyLoaded);
    for (const chunk of lazyLoadCandidates) {
      recommendations.push({
        type: 'lazy-load',
        description: `Lazy load ${chunk.name}`,
        estimatedSavingsKB: chunk.gzippedKB,
        risk: 'low',
        implementation: `Use React.lazy() for this route/component`,
      });
    }

    // Check for large libraries that can be replaced
    if (analysis.chunks.some(c => c.modules.some(m => m.includes('moment')))) {
      recommendations.push({
        type: 'replace-dep',
        description: 'Replace moment.js with date-fns',
        estimatedSavingsKB: 30,
        risk: 'medium',
        implementation: 'npm remove moment && npm install date-fns',
      });
    }

    if (analysis.chunks.some(c => c.modules.some(m => m.includes('lodash')))) {
      recommendations.push({
        type: 'replace-dep',
        description: 'Replace lodash with lodash-es',
        estimatedSavingsKB: 20,
        risk: 'low',
        implementation: 'npm remove lodash && npm install lodash-es',
      });
    }

    // Sort by impact and risk
    recommendations.sort((a, b) => {
      if (a.risk === b.risk) {
        return b.estimatedSavingsKB - a.estimatedSavingsKB;
      }
      const riskOrder = { low: 0, medium: 1, high: 2 };
      return riskOrder[a.risk] - riskOrder[b.risk];
    });

    return recommendations;
  }

  private async applyOptimizations(
    recommendations: OptimizationRecommendation[],
    input: BundleOptimizationInput
  ): Promise<void> {
    if (!input.preserveFunctionality) {
      this.logger.warn('Skipping auto-application without preserve functionality flag');
      return;
    }

    // Only apply low-risk optimizations automatically
    const safeOptimizations = recommendations.filter(r => r.risk === 'low');

    for (const optimization of safeOptimizations) {
      try {
        this.logger.info('Applying optimization', { optimization });
        
        if (optimization.type === 'replace-dep' && optimization.implementation.includes('npm')) {
          await execAsync(optimization.implementation);
        }

        // Run tests after each change
        if (input.preserveFunctionality) {
          const testResult = await execAsync('npm test').catch(e => e);
          if (testResult instanceof Error) {
            this.logger.warn('Tests failed after optimization, rolling back', { optimization });
            if (input.rollbackOnFailure) {
              await execAsync('git checkout .');
            }
          }
        }
      } catch (error) {
        this.logger.error('Failed to apply optimization', { optimization, error });
      }
    }
  }

  protected getExecutionMetadata(input: BundleOptimizationInput): Record<string, any> {
    return {
      targetSizeKB: input.targetSizeKB,
      strategy: input.strategy || 'balanced',
      preserveFunctionality: input.preserveFunctionality,
    };
  }
}