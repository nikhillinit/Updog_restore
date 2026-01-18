// REFLECTION_ID: REFL-003
// This test is linked to: docs/skills/REFL-003-cross-platform-file-enumeration-fragility.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-003: Cross-Platform File Enumeration Fragility
 *
 * Filesystem walking produces different results on Windows vs Linux
 * due to untracked directories, gitignore behavior, and path separators.
 */
describe('REFL-003: Cross-Platform File Enumeration Fragility', () => {
  // Simulates filesystem enumeration (the anti-pattern)
  function simulateFilesystemWalk(
    allFiles: string[],
    untrackedFiles: string[]
  ): string[] {
    // Filesystem walk sees ALL files including untracked
    return [...allFiles, ...untrackedFiles];
  }

  // Simulates git ls-files (the fix)
  function simulateGitLsFiles(trackedFiles: string[]): string[] {
    // git ls-files only returns tracked files
    return trackedFiles.map((f) => f.replace(/\\/g, '/')); // Normalize paths
  }

  // Normalize path separators (part of the fix)
  function normalizePaths(paths: string[]): string[] {
    return paths.map((p) => p.replace(/\\/g, '/'));
  }

  describe('Anti-pattern: Filesystem walking produces inconsistent results', () => {
    it('should demonstrate different file counts on different platforms', () => {
      // Files tracked in git (consistent across platforms)
      const trackedFiles = [
        'docs/README.md',
        'docs/guide/intro.md',
        'docs/guide/setup.md',
      ];

      // Untracked files that exist locally but not in CI
      const localOnlyFiles = [
        'docs/_archive/old-guide.md',
        'docs/_archive/deprecated.md',
        'docs/_archive/notes/scratch.md',
      ];

      // Simulate what Windows developer sees (has _archive locally)
      const windowsResult = simulateFilesystemWalk(trackedFiles, localOnlyFiles);

      // Simulate what CI sees (clean clone, no _archive)
      const ciResult = simulateFilesystemWalk(trackedFiles, []);

      // The anti-pattern: different counts!
      expect(windowsResult.length).toBe(6); // 3 tracked + 3 untracked
      expect(ciResult.length).toBe(3); // Only tracked files
      expect(windowsResult.length).not.toBe(ciResult.length);
    });

    it('should show path separator differences between platforms', () => {
      // Windows paths
      const windowsPaths = ['docs\\guide\\intro.md', 'docs\\guide\\setup.md'];

      // Linux paths
      const linuxPaths = ['docs/guide/intro.md', 'docs/guide/setup.md'];

      // Without normalization, comparison fails
      expect(windowsPaths).not.toEqual(linuxPaths);

      // With normalization, they match
      expect(normalizePaths(windowsPaths)).toEqual(linuxPaths);
    });
  });

  describe('Verified fix: git ls-files for deterministic enumeration', () => {
    it('should return consistent file list regardless of platform', () => {
      const trackedFiles = [
        'docs/README.md',
        'docs/guide/intro.md',
        'docs/guide/setup.md',
      ];

      // Both platforms get same result from git ls-files
      const windowsGitResult = simulateGitLsFiles(trackedFiles);
      const linuxGitResult = simulateGitLsFiles(trackedFiles);

      expect(windowsGitResult).toEqual(linuxGitResult);
      expect(windowsGitResult.length).toBe(3);
    });

    it('should normalize path separators in output', () => {
      // Even if git returns Windows-style paths
      const windowsStylePaths = ['docs\\README.md', 'docs\\guide\\intro.md'];

      const normalized = simulateGitLsFiles(windowsStylePaths);

      // All paths should use forward slashes
      for (const path of normalized) {
        expect(path).not.toContain('\\');
        expect(path).toContain('/');
      }
    });

    it('should exclude untracked directories from enumeration', () => {
      const trackedFiles = ['docs/README.md', 'docs/guide/intro.md'];

      // git ls-files never includes untracked files
      const result = simulateGitLsFiles(trackedFiles);

      // No _archive files appear
      expect(result.every((f) => !f.includes('_archive'))).toBe(true);
    });

    it('should produce deterministic comparison results', () => {
      // Simulating the comparison scenario from the reflection
      const localTracked = [
        'docs/README.md',
        'docs/guide/intro.md',
        'docs/guide/setup.md',
      ];

      const ciTracked = [
        'docs/README.md',
        'docs/guide/intro.md',
        'docs/guide/setup.md',
      ];

      // Using git ls-files, both produce identical results
      const localResult = simulateGitLsFiles(localTracked);
      const ciResult = simulateGitLsFiles(ciTracked);

      expect(localResult).toEqual(ciResult);
      expect(localResult.length).toBe(ciResult.length);
    });
  });
});
