import type { AgentExecutionContext } from '@agent-core/BaseAgent';
import { BaseAgent } from '@agent-core/BaseAgent';
import { withThinking } from '@agent-core/ThinkingMixin';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RouteOptimizationInput {
  analyzeUsage?: boolean;
  implementLazy?: boolean;
  generateLoadingStates?: boolean;
  testNavigation?: boolean;
  preservePreload?: string[];
}

export interface RouteAnalysis {
  routes: RouteInfo[];
  optimizationOpportunities: RouteOptimization[];
  estimatedSavingsKB: number;
  implementationPlan: ImplementationStep[];
  riskAssessment: RiskAssessment;
}

interface RouteInfo {
  path: string;
  component: string;
  isLazy: boolean;
  bundleSizeKB: number;
  dependencies: string[];
  usageFrequency?: 'high' | 'medium' | 'low';
  loadTime?: number;
}

interface RouteOptimization {
  route: string;
  type: 'make-lazy' | 'prefetch' | 'code-split' | 'inline-critical';
  savingsKB: number;
  implementation: string;
  priority: number;
}

interface ImplementationStep {
  step: number;
  description: string;
  file: string;
  changes: string;
  risk: 'low' | 'medium' | 'high';
}

interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  concerns: string[];
  mitigations: string[];
}

export class RouteOptimizationAgent extends withThinking(BaseAgent)<RouteOptimizationInput, RouteAnalysis> {
  constructor() {
    super({
      name: 'RouteOptimizationAgent',
      maxRetries: 2,
      retryDelay: 2000,
      timeout: 90000,
      logLevel: 'info',

      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'agent:route-optimization',
      memoryScope: 'project', // Learn route optimization patterns and lazy loading effectiveness
    });
  }

  protected async performOperation(
    input: RouteOptimizationInput,
    context: AgentExecutionContext
  ): Promise<RouteAnalysis> {
    this.logger.info('Starting route optimization analysis', { input });

    // Analyze current routing setup
    const routes = await this.analyzeRoutes();
    
    // Analyze usage patterns if requested
    if (input.analyzeUsage) {
      await this.enrichWithUsageData(routes);
    }

    // Generate optimization opportunities
    const opportunities = this.generateOptimizationOpportunities(routes, input);

    // Calculate estimated savings
    const estimatedSavingsKB = opportunities.reduce(
      (sum, opt) => sum + opt.savingsKB,
      0
    );

    // Generate implementation plan
    const implementationPlan = this.generateImplementationPlan(opportunities, routes);

    // Assess risks
    const riskAssessment = this.assessRisks(opportunities, routes);

    // Apply optimizations if requested
    if (input.implementLazy) {
      await this.implementOptimizations(opportunities, input);
    }

    return {
      routes,
      optimizationOpportunities: opportunities,
      estimatedSavingsKB,
      implementationPlan,
      riskAssessment,
    };
  }

  private async analyzeRoutes(): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];
    const routesDir = path.resolve('client/src/pages');
    const routerFile = path.resolve('client/src/App.tsx');

    if (!fs.existsSync(routesDir)) {
      this.logger.warn('Routes directory not found', { routesDir });
      return routes;
    }

    // Scan for route components
    const routeFiles = this.scanForRouteFiles(routesDir);

    for (const file of routeFiles) {
      const routeInfo = await this.analyzeRouteFile(file);
      routes.push(routeInfo);
    }

    // Check if routes are already lazy loaded
    if (fs.existsSync(routerFile)) {
      const routerContent = fs.readFileSync(routerFile, 'utf8');
      
      for (const route of routes) {
        route.isLazy = this.isRouteLazy(route.component, routerContent);
      }
    }

    return routes;
  }

  private scanForRouteFiles(dir: string): string[] {
    const files: string[] = [];

    const scan = (currentDir: string) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (item.endsWith('.tsx') || item.endsWith('.jsx')) {
          files.push(fullPath);
        }
      }
    };

    scan(dir);
    return files;
  }

  private async analyzeRouteFile(filePath: string): Promise<RouteInfo> {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Extract route path from file name or content
    const routePath = this.extractRoutePath(fileName, content);
    
    // Analyze dependencies
    const dependencies = this.extractDependencies(content);
    
    // Estimate bundle size (simplified - in production, use webpack stats)
    const stats = fs.statSync(filePath);
    const estimatedSize = Math.round(stats.size / 1024) * 3; // Rough estimate with dependencies

    return {
      path: routePath,
      component: fileName,
      isLazy: false, // Will be updated later
      bundleSizeKB: estimatedSize,
      dependencies,
    };
  }

  private extractRoutePath(fileName: string, content: string): string {
    // Try to extract from route definition
    const pathMatch = content.match(/path:\s*["']([^"']+)["']/);
    if (pathMatch) {
      return pathMatch[1];
    }

    // Convert file name to route path
    const path = fileName
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');

    return `/${path}`;
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const importPattern = /import .* from ['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      if (!match[1].startsWith('.')) {
        dependencies.push(match[1]);
      }
    }

    return dependencies;
  }

  private isRouteLazy(componentName: string, routerContent: string): boolean {
    // Check for React.lazy usage
    const lazyPattern = new RegExp(`lazy\\(.*${componentName}.*\\)`);
    return lazyPattern.test(routerContent);
  }

  private async enrichWithUsageData(routes: RouteInfo[]): Promise<void> {
    // In production, this would connect to analytics
    // For now, use heuristics based on route names
    
    for (const route of routes) {
      if (route.path === '/' || route.path.includes('dashboard')) {
        route.usageFrequency = 'high';
      } else if (route.path.includes('settings') || route.path.includes('admin')) {
        route.usageFrequency = 'low';
      } else {
        route.usageFrequency = 'medium';
      }
    }
  }

  private generateOptimizationOpportunities(
    routes: RouteInfo[],
    input: RouteOptimizationInput
  ): RouteOptimization[] {
    const opportunities: RouteOptimization[] = [];

    for (const route of routes) {
      // Skip if in preserve list
      if (input.preservePreload?.includes(route.path)) {
        continue;
      }

      // Suggest lazy loading for non-lazy routes
      if (!route.isLazy && route.bundleSizeKB > 10) {
        const priority = route.usageFrequency === 'high' ? 3 : 
                        route.usageFrequency === 'medium' ? 2 : 1;

        opportunities.push({
          route: route.path,
          type: 'make-lazy',
          savingsKB: route.bundleSizeKB,
          implementation: `Convert ${route.component} to lazy loading with React.lazy()`,
          priority,
        });
      }

      // Suggest prefetching for high-usage lazy routes
      if (route.isLazy && route.usageFrequency === 'high') {
        opportunities.push({
          route: route.path,
          type: 'prefetch',
          savingsKB: 0, // No size savings, but improves UX
          implementation: `Add prefetch on hover/focus for ${route.component}`,
          priority: 2,
        });
      }

      // Suggest code splitting for large routes
      if (route.bundleSizeKB > 50) {
        opportunities.push({
          route: route.path,
          type: 'code-split',
          savingsKB: Math.round(route.bundleSizeKB * 0.3),
          implementation: `Split ${route.component} into smaller chunks`,
          priority: 1,
        });
      }
    }

    // Sort by priority and savings
    opportunities.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.savingsKB - a.savingsKB;
    });

    return opportunities;
  }

  private generateImplementationPlan(
    opportunities: RouteOptimization[],
    routes: RouteInfo[]
  ): ImplementationStep[] {
    const steps: ImplementationStep[] = [];
    let stepNumber = 1;

    // Group by optimization type for logical ordering
    const lazyLoading = opportunities.filter(o => o.type === 'make-lazy');
    const prefetching = opportunities.filter(o => o.type === 'prefetch');
    const codeSplitting = opportunities.filter(o => o.type === 'code-split');

    // Step 1: Implement lazy loading
    for (const opt of lazyLoading) {
      const route = routes.find(r => r.path === opt.route);
      if (route) {
        steps.push({
          step: stepNumber++,
          description: `Convert ${route.component} to lazy loading`,
          file: `client/src/App.tsx`,
          changes: `
// Replace
import ${route.component} from './pages/${route.component}';

// With
const ${route.component} = React.lazy(() => import('./pages/${route.component}'));

// Wrap route with Suspense
<Suspense fallback={<Loading />}>
  <Route path="${route.path}" element={<${route.component} />} />
</Suspense>`,
          risk: 'low',
        });
      }
    }

    // Step 2: Add prefetching
    for (const opt of prefetching) {
      steps.push({
        step: stepNumber++,
        description: `Add prefetching for ${opt.route}`,
        file: `client/src/components/Navigation.tsx`,
        changes: `
// Add prefetch on hover
<Link 
  to="${opt.route}"
  onMouseEnter={() => import('./pages/${opt.route}')}
  onFocus={() => import('./pages/${opt.route}')}
>`,
        risk: 'low',
      });
    }

    // Step 3: Code splitting
    for (const opt of codeSplitting) {
      steps.push({
        step: stepNumber++,
        description: `Split ${opt.route} into smaller chunks`,
        file: `client/src/pages/${opt.route}`,
        changes: `Extract heavy components into separate lazy-loaded modules`,
        risk: 'medium',
      });
    }

    return steps;
  }

  private assessRisks(
    opportunities: RouteOptimization[],
    routes: RouteInfo[]
  ): RiskAssessment {
    const concerns: string[] = [];
    const mitigations: string[] = [];

    // Check for high-traffic routes being made lazy
    const highTrafficLazy = opportunities.filter(
      o => o.type === 'make-lazy' && 
      routes.find(r => r.path === o.route)?.usageFrequency === 'high'
    );

    if (highTrafficLazy.length > 0) {
      concerns.push('Lazy loading high-traffic routes may cause loading delays');
      mitigations.push('Implement prefetching for high-traffic lazy routes');
    }

    // Check for complex dependencies
    const complexRoutes = routes.filter(r => r.dependencies.length > 10);
    if (complexRoutes.length > 0) {
      concerns.push('Routes with many dependencies may not benefit from lazy loading');
      mitigations.push('Consider code splitting within the route components');
    }

    // Overall risk assessment
    const overallRisk = concerns.length > 2 ? 'high' : 
                        concerns.length > 0 ? 'medium' : 'low';

    return {
      overallRisk,
      concerns,
      mitigations,
    };
  }

  private async implementOptimizations(
    opportunities: RouteOptimization[],
    input: RouteOptimizationInput
  ): Promise<void> {
    this.logger.info('Implementing route optimizations');

    // Only implement low-risk optimizations automatically
    const safeOptimizations = opportunities.filter(
      o => o.type === 'make-lazy' && o.priority <= 2
    );

    for (const opt of safeOptimizations) {
      try {
        // This would implement the actual code changes
        // For safety, we'll just log what would be done
        this.logger.info('Would implement optimization', { opt });

        if (input.generateLoadingStates) {
          await this.generateLoadingComponent();
        }

        if (input.testNavigation) {
          await this.testRouteNavigation(opt.route);
        }
      } catch (error) {
        this.logger.error('Failed to implement optimization', { opt, error });
      }
    }
  }

  private async generateLoadingComponent(): Promise<void> {
    const loadingComponent = `
import React from 'react';
import { Loader2 } from 'lucide-react';

export const RouteLoading: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
};
`;

    const componentPath = path.resolve('client/src/components/RouteLoading.tsx');
    fs.writeFileSync(componentPath, loadingComponent);
    this.logger.info('Generated loading component', { componentPath });
  }

  private async testRouteNavigation(route: string): Promise<void> {
    // Run navigation tests
    try {
      await execAsync(`npm test -- --grep "navigation ${route}"`);
      this.logger.info('Navigation test passed', { route });
    } catch (error) {
      this.logger.warn('Navigation test failed', { route, error });
    }
  }

  protected getExecutionMetadata(input: RouteOptimizationInput): Record<string, any> {
    return {
      analyzeUsage: input.analyzeUsage,
      implementLazy: input.implementLazy,
      generateLoadingStates: input.generateLoadingStates,
      preservePreload: input.preservePreload,
    };
  }
}