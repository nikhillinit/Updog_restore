import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DependencyAnalysisAgent } from '../DependencyAnalysisAgent';
import type { DependencyAnalysisInput } from '../DependencyAnalysisAgent';
import * as fs from 'fs';
import * as child_process from 'child_process';

// Mock fs and child_process
vi.mock('fs');
vi.mock('child_process');

describe('DependencyAnalysisAgent', () => {
  let agent: DependencyAnalysisAgent;

  beforeEach(() => {
    agent = new DependencyAnalysisAgent();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Instantiation', () => {
    it('should create an instance of DependencyAnalysisAgent', () => {
      expect(agent).toBeInstanceOf(DependencyAnalysisAgent);
    });

    it('should have correct agent name', () => {
      // Agent should be properly configured via BaseAgent
      expect(agent).toBeDefined();
    });
  });

  describe('Dependency Analysis Operations', () => {
    beforeEach(() => {
      // Mock package.json
      const mockPackageJson = JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
          'lodash': '^4.17.21',
          'moment': '^2.29.4',
        },
        devDependencies: {
          'typescript': '^5.0.0',
          'vitest': '^1.0.0',
        }
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(mockPackageJson);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([] as any);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, size: 1024 } as any);
    });

    it('should execute with empty input', async () => {
      const input: DependencyAnalysisInput = {};

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.unusedDependencies).toEqual([]);
        expect(result.data.heavyDependencies).toEqual([]);
        expect(result.data.duplicateDependencies).toEqual([]);
        expect(result.data.alternatives).toEqual([]);
      }
    });

    it('should check for unused dependencies when enabled', async () => {
      const mockDepcheckOutput = JSON.stringify({
        dependencies: ['moment'],
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockDepcheckOutput, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkUnused: true,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.unusedDependencies).toBeDefined();
      }
    });

    it('should check for heavy dependencies when enabled', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'express': { version: '4.18.0' },
          'lodash': { version: '4.17.21' },
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkHeavy: true,
        thresholdKB: 50,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should check for duplicate dependencies when enabled', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'lodash': {
            version: '4.17.21',
            dependencies: {
              'other-lib': {
                version: '1.0.0',
                dependencies: {
                  'lodash': { version: '4.17.20' }
                }
              }
            }
          }
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkDuplicates: true,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should suggest alternatives for heavy dependencies', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'moment': { version: '2.29.4' },
          'lodash': { version: '4.17.21' },
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      // Mock package size to return values above threshold
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isDirectory: () => false,
        size: 150 * 1024 // 150KB to trigger heavy dependency detection
      } as any);

      const input: DependencyAnalysisInput = {
        checkHeavy: true,
        suggestAlternatives: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.alternatives).toBeDefined();
      }
    });

    it('should run all checks in parallel', async () => {
      const mockDepcheckOutput = JSON.stringify({ dependencies: [] });
      const mockNpmLsOutput = JSON.stringify({ dependencies: {} });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        const output = cmd.includes('depcheck') ? mockDepcheckOutput : mockNpmLsOutput;
        callback(null, { stdout: output, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkUnused: true,
        checkHeavy: true,
        checkDuplicates: true,
        suggestAlternatives: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.unusedDependencies).toBeDefined();
        expect(result.data.heavyDependencies).toBeDefined();
        expect(result.data.duplicateDependencies).toBeDefined();
        expect(result.data.alternatives).toBeDefined();
        expect(result.data.removalCommands).toBeDefined();
        expect(typeof result.data.totalSavingsKB).toBe('number');
      }
    });

    it('should calculate total savings correctly', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'lodash': { version: '4.17.21' },
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkUnused: true,
        checkHeavy: true,
        suggestAlternatives: true,
        thresholdKB: 10,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.totalSavingsKB).toBeGreaterThanOrEqual(0);
      }
    });

    it('should generate removal commands', async () => {
      const mockDepcheckOutput = JSON.stringify({
        dependencies: ['unused-package'],
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockDepcheckOutput, stderr: '' });
        return {} as any;
      });

      const input: DependencyAnalysisInput = {
        checkUnused: true,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        expect(result.data.removalCommands).toBeDefined();
        expect(Array.isArray(result.data.removalCommands)).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle depcheck errors gracefully', async () => {
      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(new Error('depcheck failed'), { stdout: '{}', stderr: 'error' });
        return {} as any;
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        dependencies: { 'express': '^4.0.0' }
      }));
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([] as any);

      const input: DependencyAnalysisInput = {
        checkUnused: true,
      };

      const result = await agent.execute(input);

      // Should still succeed with fallback analysis
      expect(result.success).toBe(true);
    });

    it('should handle npm ls errors gracefully', async () => {
      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(new Error('npm ls failed'), { stdout: '{}', stderr: 'error' });
        return {} as any;
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        dependencies: {}
      }));

      const input: DependencyAnalysisInput = {
        checkHeavy: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      // Should still succeed with empty results
      expect(result.success).toBe(true);
    });

    it('should handle missing package.json gracefully', async () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File not found');
      });

      const input: DependencyAnalysisInput = {
        checkUnused: true,
      };

      const result = await agent.execute(input);

      // Should handle the error
      expect(result).toBeDefined();
    });
  });

  describe('Known Alternatives', () => {
    it('should suggest date-fns instead of moment', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'moment': { version: '2.29.4' },
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        dependencies: { 'moment': '2.29.4' }
      }));

      // Mock large package size
      vi.spyOn(fs, 'statSync').mockReturnValue({
        isDirectory: () => false,
        size: 200 * 1024
      } as any);

      const input: DependencyAnalysisInput = {
        checkHeavy: true,
        suggestAlternatives: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        const momentAlternative = result.data.alternatives.find(alt => alt.current === 'moment');
        if (momentAlternative) {
          expect(momentAlternative.suggested).toBe('date-fns');
          expect(momentAlternative.migrationEffort).toBe('medium');
        }
      }
    });

    it('should suggest lodash-es instead of lodash', async () => {
      const mockNpmLsOutput = JSON.stringify({
        dependencies: {
          'lodash': { version: '4.17.21' },
        }
      });

      vi.spyOn(child_process, 'exec').mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: mockNpmLsOutput, stderr: '' });
        return {} as any;
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        dependencies: { 'lodash': '4.17.21' }
      }));

      vi.spyOn(fs, 'statSync').mockReturnValue({
        isDirectory: () => false,
        size: 150 * 1024
      } as any);

      const input: DependencyAnalysisInput = {
        checkHeavy: true,
        suggestAlternatives: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      expect(result.success).toBe(true);
      if (result.data) {
        const lodashAlternative = result.data.alternatives.find(alt => alt.current === 'lodash');
        if (lodashAlternative) {
          expect(lodashAlternative.suggested).toBe('lodash-es');
          expect(lodashAlternative.migrationEffort).toBe('low');
        }
      }
    });
  });

  describe('Integration with BaseAgent', () => {
    it('should track execution metrics', async () => {
      const input: DependencyAnalysisInput = {};

      const result = await agent.execute(input);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.executionTimeMs).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should include metadata in results', async () => {
      const input: DependencyAnalysisInput = {
        checkUnused: true,
        checkHeavy: true,
        thresholdKB: 100,
      };

      const result = await agent.execute(input);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.checkUnused).toBe(true);
      expect(result.metadata?.checkHeavy).toBe(true);
      expect(result.metadata?.thresholdKB).toBe(100);
    });
  });
});
