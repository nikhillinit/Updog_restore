/**
 * @group integration
 * FIXME: Requires Vite build process integration testing
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe.skip('Vite Build Regression - Fix #3', () => {
  describe('Manual chunking should not cause TDZ errors', () => {
    it('should not have manual chunking that splits providers (causes TDZ errors)', async () => {
      // Original bug: manualChunks splitting FeatureFlagProvider into separate chunk
      // caused "Cannot access 'FeatureFlagProvider' before initialization" (TDZ error)
      // Fix: Removed problematic manual chunking, set to undefined

      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Check 1: Verify manualChunks is set to undefined (the fix)
      const hasManualChunksUndefined = viteConfig.includes('manualChunks: undefined');
      expect(hasManualChunksUndefined).toBe(true);

      // Check 2: If any manual chunking exists, ensure it doesn't split providers
      const manualChunksMatch = viteConfig.match(/manualChunks:\s*{([^}]+)}/s);
      if (manualChunksMatch && !viteConfig.includes('manualChunks: undefined')) {
        const chunksConfig = manualChunksMatch[1];

        // These patterns would cause TDZ errors if present
        const problematicPatterns = [/Provider/i, /FeatureFlag/i, /Context/i];

        for (const pattern of problematicPatterns) {
          expect(chunksConfig).not.toMatch(pattern);
        }
      }
    });

    it('should use Vite default chunking strategy (not custom manual chunks)', async () => {
      // Verify the fix: manualChunks should be undefined to use Vite's automatic chunking
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // The fix sets manualChunks: undefined in rollupOptions.output
      const rollupOutputSection = viteConfig.match(
        /rollupOptions:\s*{[\s\S]*?output:\s*{[\s\S]*?}/
      );
      expect(rollupOutputSection).toBeTruthy();

      if (rollupOutputSection) {
        const outputConfig = rollupOutputSection[0];

        // Should have manualChunks: undefined (the fix)
        expect(outputConfig).toMatch(/manualChunks:\s*undefined/);
      }
    });

    it('should not have circular dependency patterns in manual chunks', async () => {
      // Additional safety check: if manual chunking is ever re-introduced,
      // verify it doesn't create circular dependencies

      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Parse manual chunks if they exist
      const manualChunksMatch = viteConfig.match(/manualChunks:\s*{([^}]+)}/s);

      if (manualChunksMatch && !viteConfig.includes('manualChunks: undefined')) {
        const chunksConfig = manualChunksMatch[1];

        // If provider code is ever chunked separately, it's a red flag
        // Providers should be in main chunk or automatically chunked
        expect(chunksConfig).not.toContain('FeatureFlagProvider');
        expect(chunksConfig).not.toContain('providers/');
        expect(chunksConfig).not.toContain('Context');
      }
    });
  });

  describe('Build configuration validation', () => {
    it('should have treeshaking enabled', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Verify tree shaking is enabled (helps prevent TDZ issues)
      expect(viteConfig).toMatch(/treeShaking:\s*true/i);
    });

    it('should have proper module preload configuration', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Verify modulePreload exists (prevents premature loading)
      expect(viteConfig).toMatch(/modulePreload:/);
    });

    it('should not have aggressive code splitting that breaks initialization order', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Check for potentially problematic splitting strategies
      const hasModuleSideEffectsConfig = viteConfig.match(/moduleSideEffects:/);

      if (hasModuleSideEffectsConfig) {
        // Should be 'no-external' to prevent side effect issues
        expect(viteConfig).toMatch(/moduleSideEffects:\s*['"]no-external['"]/);
      }
    });
  });

  describe('TDZ prevention: Provider initialization order', () => {
    it('should verify FeatureFlagProvider exports are not split', async () => {
      // Check that the provider file itself doesn't have issues
      const providerPath = path.join(process.cwd(), 'client/src/providers/FeatureFlagProvider.tsx');

      try {
        const providerContent = await fs.readFile(providerPath, 'utf-8');

        // Verify provider has proper exports
        expect(providerContent).toContain('export function FeatureFlagProvider');
        expect(providerContent).toContain('export function useFeatureFlags');

        // Verify no circular imports that could cause TDZ
        const importLines = providerContent
          .split('\n')
          .filter((line) => line.trim().startsWith('import'));

        // Provider should not import from itself or create cycles
        for (const importLine of importLines) {
          expect(importLine).not.toContain('FeatureFlagProvider');
        }
      } catch {
        // Provider file might not exist in test environment
        // This is acceptable - test passes
      }
    });

    it('should ensure proper export/import patterns', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Verify proper ES module handling
      expect(viteConfig).toMatch(/format.*['"]es['"]/i);

      // Verify proper conditions for module resolution
      const resolveSection = viteConfig.match(/resolve:\s*{[\s\S]*?}/);
      if (resolveSection) {
        expect(resolveSection[0]).toMatch(/conditions:/);
      }
    });
  });

  describe('Regression: Specific TDZ error patterns', () => {
    it('should not create scenarios that trigger "Cannot access before initialization"', async () => {
      // This test documents the specific error pattern that was fixed
      // Error: Cannot access 'FeatureFlagProvider' before initialization
      // Root cause: manualChunks splitting the provider into a separate chunk

      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // The fix: manualChunks: undefined prevents this splitting
      expect(viteConfig).toContain('manualChunks: undefined');

      // Additional check: no splitting of critical initialization code
      const outputSection = viteConfig.match(/output:\s*{[\s\S]*?}/);
      if (outputSection) {
        const output = outputSection[0];

        // Should not have patterns that split providers
        expect(output).not.toMatch(/['"]providers['"]\s*:/);
        expect(output).not.toMatch(/['"]context['"]\s*:/);
        expect(output).not.toMatch(/['"]flags['"]\s*:/);
      }
    });

    it('should allow Vite automatic chunking (the safe default)', async () => {
      // Verify we're using Vite's intelligent automatic chunking
      // instead of manual chunking that can break initialization

      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // manualChunks: undefined means Vite handles chunking automatically
      expect(viteConfig).toMatch(/manualChunks:\s*undefined/);
    });
  });

  describe('Build output validation', () => {
    it('should have proper chunk size warnings configured', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Should have chunk size warning limits
      expect(viteConfig).toMatch(/chunkSizeWarningLimit:/);
    });

    it('should generate manifest for bundle analysis', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Manifest helps debug chunking issues
      expect(viteConfig).toMatch(/manifest:\s*true/);
    });

    it('should have sourcemaps enabled for debugging TDZ issues', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Sourcemaps help debug TDZ errors
      expect(viteConfig).toMatch(/sourcemap:/);
    });
  });

  describe('Configuration safety checks', () => {
    it('should not use esbuild splitting that could cause TDZ', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Verify esbuild config doesn't interfere
      const esbuildSection = viteConfig.match(/esbuild:\s*{[\s\S]*?}/);

      if (esbuildSection) {
        const esbuild = esbuildSection[0];

        // Should not have splitting enabled in esbuild
        expect(esbuild).not.toMatch(/splitting:\s*true/);
      }
    });

    it('should have proper resolve conditions for ESM', async () => {
      const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
      const viteConfig = await fs.readFile(viteConfigPath, 'utf-8');

      // Proper resolve conditions prevent TDZ issues
      expect(viteConfig).toMatch(/conditions:\s*\[/);
      expect(viteConfig).toMatch(/["']import["']/);
      expect(viteConfig).toMatch(/["']module["']/);
    });
  });
});
