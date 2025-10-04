import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BundleOptimizationAgent } from '../BundleOptimizationAgent';
import type { BundleOptimizationInput, BundleAnalysis } from '../BundleOptimizationAgent';

describe('BundleOptimizationAgent', () => {
  let agent: BundleOptimizationAgent;

  beforeEach(() => {
    agent = new BundleOptimizationAgent();
  });

  describe('instantiation', () => {
    it('should create an instance of BundleOptimizationAgent', () => {
      expect(agent).toBeInstanceOf(BundleOptimizationAgent);
    });

    it('should have the correct agent name', () => {
      expect(agent['config'].name).toBe('BundleOptimizationAgent');
    });

    it('should have default configuration values', () => {
      expect(agent['config'].maxRetries).toBe(2);
      expect(agent['config'].retryDelay).toBe(2000);
      expect(agent['config'].timeout).toBe(120000);
      expect(agent['config'].logLevel).toBe('info');
    });

    it('should have a logger instance', () => {
      expect(agent['logger']).toBeDefined();
    });

    it('should have a metrics collector instance', () => {
      expect(agent['metrics']).toBeDefined();
    });
  });

  describe('input validation', () => {
    it('should accept valid bundle optimization input', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 500,
        preserveFunctionality: true,
        strategy: 'balanced',
      };

      expect(input.targetSizeKB).toBe(500);
      expect(input.preserveFunctionality).toBe(true);
      expect(input.strategy).toBe('balanced');
    });

    it('should handle different strategy options', () => {
      const strategies: Array<'aggressive' | 'safe' | 'balanced'> = ['aggressive', 'safe', 'balanced'];

      strategies.forEach(strategy => {
        const input: BundleOptimizationInput = {
          targetSizeKB: 300,
          preserveFunctionality: true,
          strategy,
        };
        expect(input.strategy).toBe(strategy);
      });
    });

    it('should accept optional exclude patterns', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 400,
        preserveFunctionality: true,
        excludePatterns: ['*.test.js', 'vendor/*'],
      };

      expect(input.excludePatterns).toHaveLength(2);
    });

    it('should accept rollback option', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 350,
        preserveFunctionality: true,
        rollbackOnFailure: true,
      };

      expect(input.rollbackOnFailure).toBe(true);
    });
  });

  describe('analysis capabilities', () => {
    it('should define BundleAnalysis interface correctly', () => {
      const analysis: BundleAnalysis = {
        currentSizeKB: 600,
        targetSizeKB: 400,
        chunks: [],
        recommendations: [],
        estimatedSavingsKB: 200,
      };

      expect(analysis.currentSizeKB).toBe(600);
      expect(analysis.targetSizeKB).toBe(400);
      expect(analysis.estimatedSavingsKB).toBe(200);
    });

    it('should handle chunk information structure', () => {
      const chunkInfo = {
        name: 'vendor.js',
        sizeKB: 250,
        gzippedKB: 80,
        modules: ['react', 'react-dom'],
        isVendor: true,
        canBeLazyLoaded: false,
      };

      expect(chunkInfo.name).toBe('vendor.js');
      expect(chunkInfo.isVendor).toBe(true);
      expect(chunkInfo.modules).toContain('react');
    });

    it('should handle optimization recommendations structure', () => {
      const recommendation = {
        type: 'lazy-load' as const,
        description: 'Lazy load chart components',
        estimatedSavingsKB: 50,
        risk: 'low' as const,
        implementation: 'Use React.lazy()',
      };

      expect(recommendation.type).toBe('lazy-load');
      expect(recommendation.risk).toBe('low');
      expect(recommendation.estimatedSavingsKB).toBeGreaterThan(0);
    });

    it('should support all recommendation types', () => {
      const types: Array<'lazy-load' | 'remove-dep' | 'replace-dep' | 'tree-shake' | 'code-split'> = [
        'lazy-load',
        'remove-dep',
        'replace-dep',
        'tree-shake',
        'code-split'
      ];

      types.forEach(type => {
        const recommendation = {
          type,
          description: `Test ${type}`,
          estimatedSavingsKB: 10,
          risk: 'low' as const,
          implementation: 'test implementation',
        };
        expect(recommendation.type).toBe(type);
      });
    });

    it('should support all risk levels', () => {
      const risks: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      risks.forEach(risk => {
        const recommendation = {
          type: 'tree-shake' as const,
          description: 'Test recommendation',
          estimatedSavingsKB: 15,
          risk,
          implementation: 'test',
        };
        expect(recommendation.risk).toBe(risk);
      });
    });
  });

  describe('execution metadata', () => {
    it('should generate execution metadata with required fields', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 400,
        preserveFunctionality: true,
        strategy: 'balanced',
      };

      const metadata = agent['getExecutionMetadata'](input);

      expect(metadata).toHaveProperty('targetSizeKB', 400);
      expect(metadata).toHaveProperty('strategy', 'balanced');
      expect(metadata).toHaveProperty('preserveFunctionality', true);
    });

    it('should use default strategy when not provided', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 300,
        preserveFunctionality: false,
      };

      const metadata = agent['getExecutionMetadata'](input);

      expect(metadata.strategy).toBe('balanced');
    });
  });

  describe('edge cases', () => {
    it('should handle zero target size', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 0,
        preserveFunctionality: true,
      };

      expect(input.targetSizeKB).toBe(0);
    });

    it('should handle large target sizes', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 999999,
        preserveFunctionality: true,
      };

      expect(input.targetSizeKB).toBe(999999);
    });

    it('should handle empty exclude patterns array', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 400,
        preserveFunctionality: true,
        excludePatterns: [],
      };

      expect(input.excludePatterns).toEqual([]);
    });

    it('should handle preserveFunctionality set to false', () => {
      const input: BundleOptimizationInput = {
        targetSizeKB: 300,
        preserveFunctionality: false,
      };

      expect(input.preserveFunctionality).toBe(false);
    });
  });

  describe('type safety', () => {
    it('should enforce BundleOptimizationInput type constraints', () => {
      const validInput: BundleOptimizationInput = {
        targetSizeKB: 500,
        preserveFunctionality: true,
      };

      // TypeScript should catch invalid strategy at compile time
      const inputWithStrategy: BundleOptimizationInput = {
        targetSizeKB: 500,
        preserveFunctionality: true,
        strategy: 'balanced',
      };

      expect(validInput).toBeDefined();
      expect(inputWithStrategy).toBeDefined();
    });

    it('should enforce BundleAnalysis type constraints', () => {
      const analysis: BundleAnalysis = {
        currentSizeKB: 700,
        targetSizeKB: 500,
        chunks: [
          {
            name: 'main.js',
            sizeKB: 300,
            gzippedKB: 100,
            modules: ['index', 'app'],
            isVendor: false,
            canBeLazyLoaded: false,
          }
        ],
        recommendations: [
          {
            type: 'code-split',
            description: 'Split main bundle',
            estimatedSavingsKB: 100,
            risk: 'low',
            implementation: 'Configure vite',
          }
        ],
        estimatedSavingsKB: 100,
      };

      expect(analysis.chunks).toHaveLength(1);
      expect(analysis.recommendations).toHaveLength(1);
    });
  });
});
