import { BaseAgent, AgentExecutionContext } from '@povc/agent-core';
import { withThinking } from '@povc/agent-core/ThinkingMixin';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DependencyAnalysisInput {
  checkUnused?: boolean;
  checkHeavy?: boolean;
  checkDuplicates?: boolean;
  suggestAlternatives?: boolean;
  thresholdKB?: number;
}

export interface DependencyAnalysis {
  unusedDependencies: string[];
  heavyDependencies: HeavyDependency[];
  duplicateDependencies: DuplicateDependency[];
  alternatives: AlternativeSuggestion[];
  totalSavingsKB: number;
  removalCommands: string[];
}

interface HeavyDependency {
  name: string;
  version: string;
  sizeKB: number;
  usageCount: number;
  isDevDependency: boolean;
}

interface DuplicateDependency {
  name: string;
  versions: string[];
  sizeImpactKB: number;
}

interface AlternativeSuggestion {
  current: string;
  suggested: string;
  savingsKB: number;
  migrationEffort: 'low' | 'medium' | 'high';
  command: string;
}

export class DependencyAnalysisAgent extends withThinking(BaseAgent)<DependencyAnalysisInput, DependencyAnalysis> {
  private knownAlternatives = new Map<string, AlternativeSuggestion>([
    ['moment', {
      current: 'moment',
      suggested: 'date-fns',
      savingsKB: 45,
      migrationEffort: 'medium',
      command: 'npm remove moment && npm install date-fns'
    }],
    ['lodash', {
      current: 'lodash',
      suggested: 'lodash-es',
      savingsKB: 20,
      migrationEffort: 'low',
      command: 'npm remove lodash && npm install lodash-es'
    }],
    ['axios', {
      current: 'axios',
      suggested: 'native fetch',
      savingsKB: 15,
      migrationEffort: 'medium',
      command: 'npm remove axios'
    }],
    ['uuid', {
      current: 'uuid',
      suggested: 'crypto.randomUUID()',
      savingsKB: 8,
      migrationEffort: 'low',
      command: 'npm remove uuid'
    }],
  ]);

  constructor() {
    super({
      name: 'DependencyAnalysisAgent',
      maxRetries: 2,
      retryDelay: 1000,
      timeout: 60000,
      logLevel: 'info',

      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'agent:dependency-analysis',
      memoryScope: 'project', // Track dependency patterns and successful optimizations
    });
  }

  protected async performOperation(
    input: DependencyAnalysisInput,
    context: AgentExecutionContext
  ): Promise<DependencyAnalysis> {
    this.logger.info('Starting dependency analysis', { input });

    const analysis: DependencyAnalysis = {
      unusedDependencies: [],
      heavyDependencies: [],
      duplicateDependencies: [],
      alternatives: [],
      totalSavingsKB: 0,
      removalCommands: [],
    };

    // Run all analyses in parallel for performance
    const [unused, heavy, duplicates] = await Promise.all([
      input.checkUnused ? this.findUnusedDependencies() : Promise.resolve([]),
      input.checkHeavy ? this.findHeavyDependencies(input.thresholdKB || 100) : Promise.resolve([]),
      input.checkDuplicates ? this.findDuplicateDependencies() : Promise.resolve([]),
    ]);

    analysis.unusedDependencies = unused;
    analysis.heavyDependencies = heavy;
    analysis.duplicateDependencies = duplicates;

    if (input.suggestAlternatives) {
      analysis.alternatives = await this.suggestAlternatives(heavy);
    }

    // Calculate total potential savings
    analysis.totalSavingsKB = await this.calculateTotalSavings(analysis);

    // Generate removal commands
    analysis.removalCommands = this.generateRemovalCommands(analysis);

    return analysis;
  }

  private async findUnusedDependencies(): Promise<string[]> {
    this.logger.info('Checking for unused dependencies');
    const unused: string[] = [];

    try {
      // Use depcheck if available
      const { stdout } = await execAsync('npx depcheck --json').catch(() => ({ stdout: '{}' }));
      const result = JSON.parse(stdout);
      
      if (result.dependencies) {
        unused.push(...result.dependencies);
      }
    } catch (error) {
      this.logger.warn('depcheck not available, using basic analysis');
      
      // Fallback: basic import analysis
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const dependencies = Object.keys(packageJson.dependencies || {});
      const imports = await this.scanImports();

      for (const dep of dependencies) {
        if (!imports.has(dep) && !this.isMetaDependency(dep)) {
          unused.push(dep);
        }
      }
    }

    return unused;
  }

  private async findHeavyDependencies(thresholdKB: number): Promise<HeavyDependency[]> {
    this.logger.info('Finding heavy dependencies', { thresholdKB });
    const heavy: HeavyDependency[] = [];

    try {
      // Get size information for all dependencies
      const { stdout } = await execAsync('npm ls --json --depth=0').catch(() => ({ stdout: '{}' }));
      const tree = JSON.parse(stdout);
      
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [name, version] of Object.entries(dependencies)) {
        const size = await this.getPackageSize(name);
        
        if (size > thresholdKB) {
          const usageCount = await this.countUsages(name);
          
          heavy.push({
            name,
            version: version as string,
            sizeKB: size,
            usageCount,
            isDevDependency: !!(packageJson.devDependencies && packageJson.devDependencies[name]),
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to analyze package sizes', { error });
    }

    // Sort by size descending
    return heavy.sort((a, b) => b.sizeKB - a.sizeKB);
  }

  private async findDuplicateDependencies(): Promise<DuplicateDependency[]> {
    this.logger.info('Finding duplicate dependencies');
    const duplicates: DuplicateDependency[] = [];

    try {
      const { stdout } = await execAsync('npm ls --json');
      const tree = JSON.parse(stdout);
      
      const versionMap = new Map<string, Set<string>>();
      this.walkDependencyTree(tree.dependencies || {}, versionMap);

      for (const [name, versions] of versionMap.entries()) {
        if (versions.size > 1) {
          const sizeImpact = await this.getPackageSize(name) * (versions.size - 1);
          
          duplicates.push({
            name,
            versions: Array.from(versions),
            sizeImpactKB: Math.round(sizeImpact),
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to analyze duplicates', { error });
    }

    return duplicates;
  }

  private walkDependencyTree(deps: any, versionMap: Map<string, Set<string>>, depth = 0): void {
    if (depth > 5) return; // Limit recursion depth

    for (const [name, info] of Object.entries(deps)) {
      if (typeof info === 'object' && info !== null) {
        const depInfo = info as any;
        
        if (!versionMap.has(name)) {
          versionMap.set(name, new Set());
        }
        
        if (depInfo.version) {
          versionMap.get(name)!.add(depInfo.version);
        }
        
        if (depInfo.dependencies) {
          this.walkDependencyTree(depInfo.dependencies, versionMap, depth + 1);
        }
      }
    }
  }

  private async suggestAlternatives(heavy: HeavyDependency[]): Promise<AlternativeSuggestion[]> {
    const suggestions: AlternativeSuggestion[] = [];

    for (const dep of heavy) {
      const alternative = this.knownAlternatives.get(dep.name);
      
      if (alternative) {
        suggestions.push(alternative);
      } else {
        // Check for common patterns
        if (dep.name.includes('polyfill') && dep.sizeKB > 10) {
          suggestions.push({
            current: dep.name,
            suggested: 'Modern browser features',
            savingsKB: dep.sizeKB,
            migrationEffort: 'medium',
            command: `npm remove ${dep.name}`,
          });
        }
      }
    }

    return suggestions;
  }

  private async scanImports(): Promise<Set<string>> {
    const imports = new Set<string>();
    const srcDir = path.resolve('client/src');

    const scanFile = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const importPattern = /import .* from ['"]([^'"]+)['"]/g;
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;

      let match;
      while ((match = importPattern.exec(content)) !== null) {
        const dep = this.extractPackageName(match[1]);
        if (dep) imports.add(dep);
      }
      
      while ((match = requirePattern.exec(content)) !== null) {
        const dep = this.extractPackageName(match[1]);
        if (dep) imports.add(dep);
      }
    };

    const scanDirectory = (dir: string) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !file.includes('node_modules')) {
          scanDirectory(fullPath);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          scanFile(fullPath);
        }
      }
    };

    if (fs.existsSync(srcDir)) {
      scanDirectory(srcDir);
    }

    return imports;
  }

  private extractPackageName(importPath: string): string | null {
    // Handle scoped packages
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }
    
    // Handle regular packages
    const parts = importPath.split('/');
    return parts[0] && !parts[0].startsWith('.') ? parts[0] : null;
  }

  private async getPackageSize(packageName: string): Promise<number> {
    try {
      const modulePath = path.resolve('node_modules', packageName);
      
      if (!fs.existsSync(modulePath)) {
        return 0;
      }

      const getTotalSize = (dir: string): number => {
        let total = 0;
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && file !== 'node_modules') {
            total += getTotalSize(fullPath);
          } else {
            total += stat.size;
          }
        }
        
        return total;
      };

      const sizeBytes = getTotalSize(modulePath);
      return Math.round(sizeBytes / 1024);
    } catch {
      return 0;
    }
  }

  private async countUsages(packageName: string): Promise<number> {
    const imports = await this.scanImports();
    return imports.has(packageName) ? 1 : 0;
  }

  private isMetaDependency(name: string): boolean {
    const metaDeps = ['typescript', 'eslint', 'prettier', 'vite', '@types/'];
    return metaDeps.some(meta => name.includes(meta));
  }

  private async calculateTotalSavings(analysis: DependencyAnalysis): Promise<number> {
    let total = 0;

    // Savings from unused dependencies
    for (const dep of analysis.unusedDependencies) {
      total += await this.getPackageSize(dep);
    }

    // Savings from alternatives
    total += analysis.alternatives.reduce((sum, alt) => sum + alt.savingsKB, 0);

    // Savings from deduplication
    total += analysis.duplicateDependencies.reduce((sum, dup) => sum + dup.sizeImpactKB, 0);

    return Math.round(total);
  }

  private generateRemovalCommands(analysis: DependencyAnalysis): string[] {
    const commands: string[] = [];

    if (analysis.unusedDependencies.length > 0) {
      commands.push(`npm remove ${analysis.unusedDependencies.join(' ')}`);
    }

    for (const alt of analysis.alternatives) {
      commands.push(alt.command);
    }

    if (analysis.duplicateDependencies.length > 0) {
      commands.push('npm dedupe');
    }

    return commands;
  }

  protected getExecutionMetadata(input: DependencyAnalysisInput): Record<string, any> {
    return {
      checkUnused: input.checkUnused,
      checkHeavy: input.checkHeavy,
      checkDuplicates: input.checkDuplicates,
      suggestAlternatives: input.suggestAlternatives,
      thresholdKB: input.thresholdKB,
    };
  }
}