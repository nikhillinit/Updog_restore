import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RouteOptimizationInput } from '../RouteOptimizationAgent';
import { RouteOptimizationAgent } from '../RouteOptimizationAgent';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs');
vi.mock('child_process');

describe('RouteOptimizationAgent', () => {
  let agent: RouteOptimizationAgent;

  beforeEach(() => {
    agent = new RouteOptimizationAgent();
    vi.clearAllMocks();
  });

  describe('instantiation', () => {
    it('should create an instance of RouteOptimizationAgent', () => {
      expect(agent).toBeInstanceOf(RouteOptimizationAgent);
    });

    it('should have correct agent name', () => {
      expect((agent as any).config.name).toBe('RouteOptimizationAgent');
    });

    it('should have default configuration', () => {
      const config = (agent as any).config;
      expect(config.maxRetries).toBe(2);
      expect(config.retryDelay).toBe(2000);
      expect(config.timeout).toBe(90000);
      expect(config.logLevel).toBe('info');
    });
  });

  describe('route analysis', () => {
    it('should handle missing routes directory gracefully', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: true,
      };

      // Mock fs.existsSync to return false for routes directory
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.routes).toEqual([]);
    });

    it('should analyze routes when directory exists', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
      };

      // Mock filesystem operations
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return typeof path === 'string' && path.includes('pages');
      });

      vi.mocked(fs.readdirSync).mockReturnValue([
        'Dashboard.tsx',
        'Settings.tsx',
      ] as any);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 1024,
      } as any);

      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        import { useQuery } from '@tanstack/react-query';

        export const Dashboard = () => {
          return <div>Dashboard</div>;
        };
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.routes).toBeDefined();
      expect(Array.isArray(result.data?.routes)).toBe(true);
    });

    it('should identify non-lazy routes as optimization opportunities', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
      };

      // Mock a route that is not lazy loaded
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['Dashboard.tsx'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 5120, // 5KB file, which will be ~15KB with dependencies
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export const Dashboard = () => <div>Dashboard</div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.optimizationOpportunities).toBeDefined();
      expect(result.data?.optimizationOpportunities.length).toBeGreaterThan(0);
    });

    it('should calculate estimated savings', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['LargePage.tsx'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 10240, // 10KB file
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        import { HeavyComponent } from './components';
        export const LargePage = () => <div><HeavyComponent /></div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.estimatedSavingsKB).toBeGreaterThan(0);
    });

    it('should generate implementation plan', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['Settings.tsx'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 4096,
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export const Settings = () => <div>Settings</div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.implementationPlan).toBeDefined();
      expect(Array.isArray(result.data?.implementationPlan)).toBe(true);
    });

    it('should assess risks', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: true,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['Dashboard.tsx'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 2048,
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export const Dashboard = () => <div>Dashboard</div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);
      expect(result.data?.riskAssessment).toBeDefined();
      expect(result.data?.riskAssessment.overallRisk).toMatch(/low|medium|high/);
      expect(Array.isArray(result.data?.riskAssessment.concerns)).toBe(true);
      expect(Array.isArray(result.data?.riskAssessment.mitigations)).toBe(true);
    });
  });

  describe('usage analysis', () => {
    it('should enrich routes with usage data when requested', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: true,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'Dashboard.tsx',
        'Settings.tsx',
      ] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 1024,
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export const Component = () => <div>Component</div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);

      // At least one route should have usage frequency
      const routesWithUsage = result.data?.routes.filter(r => r.usageFrequency);
      expect(routesWithUsage).toBeDefined();
      expect(routesWithUsage!.length).toBeGreaterThan(0);
    });
  });

  describe('optimization preservation', () => {
    it('should respect preservePreload list', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
        preservePreload: ['/dashboard'],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['Dashboard.tsx'] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 10240, // Large enough to trigger optimization
      } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        import React from 'react';
        export const Dashboard = () => <div>Dashboard</div>;
      `);

      const result = await agent.execute(mockInput);

      expect(result.success).toBe(true);

      // Should not have optimization for /dashboard
      const dashboardOpt = result.data?.optimizationOpportunities.find(
        opt => opt.route === '/dashboard'
      );
      expect(dashboardOpt).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await agent.execute(mockInput);

      // Should still complete but may have limited data
      expect(result.success).toBeDefined();
    });
  });

  describe('execution metadata', () => {
    it('should include input parameters in execution metadata', async () => {
      const mockInput: RouteOptimizationInput = {
        analyzeUsage: true,
        implementLazy: false,
        generateLoadingStates: true,
        preservePreload: ['/home'],
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await agent.execute(mockInput);

      expect(result.context.metadata).toBeDefined();
      expect(result.context.metadata?.analyzeUsage).toBe(true);
      expect(result.context.metadata?.implementLazy).toBe(false);
      expect(result.context.metadata?.generateLoadingStates).toBe(true);
      expect(result.context.metadata?.preservePreload).toEqual(['/home']);
    });
  });
});
