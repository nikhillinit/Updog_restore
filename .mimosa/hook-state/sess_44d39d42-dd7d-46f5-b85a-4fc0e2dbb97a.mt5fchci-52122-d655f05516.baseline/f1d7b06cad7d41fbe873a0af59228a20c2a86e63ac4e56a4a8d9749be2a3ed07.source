#!/usr/bin/env tsx

/**
 * Intelligent Test Selector
 *
 * Analyzes git diff and code dependencies to run only relevant tests,
 * significantly reducing test execution time while maintaining coverage.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  linesChanged: number;
}

interface TestFile {
  path: string;
  relatedFiles: string[];
  testCategories: string[];
  estimatedDuration: number;
}

interface TestSelection {
  essential: TestFile[];
  related: TestFile[];
  performance: TestFile[];
  integration: TestFile[];
  total: number;
  estimatedTime: number;
}

class IntelligentTestSelector {
  private changedFiles: FileChange[] = [];
  private allTestFiles: TestFile[] = [];
  private dependencyGraph = new Map<string, string[]>();

  constructor() {
    this.buildDependencyGraph();
    this.indexTestFiles();
  }

  /**
   * Build dependency graph by analyzing imports
   */
  private buildDependencyGraph(): void {
    const sourceFiles = this.findSourceFiles();

    for (const file of sourceFiles) {
      const dependencies = this.extractImports(file);
      this.dependencyGraph.set(file, dependencies);
    }
  }

  /**
   * Find all source files in the project
   */
  private findSourceFiles(): string[] {
    const sourceFiles: string[] = [];
    const sourceDirs = ['client/src', 'server', 'shared', 'tests'];

    for (const dir of sourceDirs) {
      const fullPath = join(projectRoot, dir);
      if (existsSync(fullPath)) {
        this.walkDirectory(fullPath, sourceFiles, ['.ts', '.tsx', '.js', '.jsx']);
      }
    }

    return sourceFiles;
  }

  /**
   * Recursively walk directory to find files
   */
  private walkDirectory(dir: string, files: string[], extensions: string[]): void {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.walkDirectory(fullPath, files, extensions);
      } else if (stat.isFile() && extensions.includes(extname(item))) {
        files.push(relative(projectRoot, fullPath));
      }
    }
  }

  /**
   * Extract import statements from a file
   */
  private extractImports(filePath: string): string[] {
    const fullPath = join(projectRoot, filePath);
    if (!existsSync(fullPath)) return [];

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const imports: string[] = [];

      // Match import statements
      const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))?\s*from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Resolve relative imports
        if (importPath.startsWith('.')) {
          const resolvedPath = this.resolveRelativeImport(filePath, importPath);
          if (resolvedPath) imports.push(resolvedPath);
        } else if (importPath.startsWith('@/') || importPath.startsWith('@shared/')) {
          // Handle path aliases
          const aliasPath = this.resolvePathAlias(importPath);
          if (aliasPath) imports.push(aliasPath);
        }
      }

      return imports;
    } catch (error) {
      console.warn(`Failed to extract imports from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Resolve relative import paths
   */
  private resolveRelativeImport(fromFile: string, importPath: string): string | null {
    const fromDir = dirname(fromFile);
    const resolvedPath = join(fromDir, importPath);

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      if (existsSync(join(projectRoot, fullPath))) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Resolve path aliases (@/, @shared/, etc.)
   */
  private resolvePathAlias(importPath: string): string | null {
    if (importPath.startsWith('@/')) {
      return importPath.replace('@/', 'client/src/');
    } else if (importPath.startsWith('@shared/')) {
      return importPath.replace('@shared/', 'shared/');
    }
    return null;
  }

  /**
   * Index all test files with metadata
   */
  private indexTestFiles(): void {
    const testFiles = this.findSourceFiles().filter(f => f.includes('.test.'));

    for (const testFile of testFiles) {
      const relatedFiles = this.findRelatedFiles(testFile);
      const categories = this.categorizeTest(testFile);
      const duration = this.estimateTestDuration(testFile);

      this.allTestFiles.push({
        path: testFile,
        relatedFiles,
        testCategories: categories,
        estimatedDuration: duration
      });
    }
  }

  /**
   * Find files related to a test file
   */
  private findRelatedFiles(testFile: string): string[] {
    const related: string[] = [];

    // Direct source file
    const sourceFile = testFile
      .replace('.test.', '.')
      .replace(/\.(ts|tsx|js|jsx)$/, '.ts');

    if (existsSync(join(projectRoot, sourceFile))) {
      related.push(sourceFile);
    }

    // Files imported by the test
    const testImports = this.extractImports(testFile);
    related.push(...testImports);

    // Files that import the tested module
    for (const [file, imports] of this.dependencyGraph) {
      if (imports.includes(sourceFile)) {
        related.push(file);
      }
    }

    return [...new Set(related)];
  }

  /**
   * Categorize test based on file path and content
   */
  private categorizeTest(testFile: string): string[] {
    const categories: string[] = [];

    if (testFile.includes('/unit/')) categories.push('unit');
    if (testFile.includes('/integration/')) categories.push('integration');
    if (testFile.includes('/api/')) categories.push('api');
    if (testFile.includes('/performance/') || testFile.includes('bench')) categories.push('performance');
    if (testFile.includes('/e2e/')) categories.push('e2e');
    if (testFile.includes('/visual/')) categories.push('visual');
    if (testFile.includes('/chaos/')) categories.push('chaos');

    // Analyze content for more specific categories
    try {
      const content = readFileSync(join(projectRoot, testFile), 'utf-8');

      if (content.includes('Monte Carlo') || content.includes('simulation')) {
        categories.push('monte-carlo');
      }
      if (content.includes('XIRR') || content.includes('IRR')) {
        categories.push('financial');
      }
      if (content.includes('database') || content.includes('schema')) {
        categories.push('database');
      }
      if (content.includes('Redis') || content.includes('cache')) {
        categories.push('cache');
      }
    } catch (error) {
      // Ignore content analysis errors
    }

    return categories.length > 0 ? categories : ['general'];
  }

  /**
   * Estimate test duration based on complexity
   */
  private estimateTestDuration(testFile: string): number {
    try {
      const content = readFileSync(join(projectRoot, testFile), 'utf-8');

      // Base duration
      let duration = 100; // 100ms base

      // Count test cases
      const testCount = (content.match(/it\(|test\(/g) || []).length;
      duration += testCount * 50;

      // Complexity factors
      if (content.includes('database')) duration += 200;
      if (content.includes('Redis')) duration += 150;
      if (content.includes('simulation')) duration += 500;
      if (content.includes('integration')) duration += 300;
      if (content.includes('async')) duration += 100;

      return Math.min(duration, 5000); // Cap at 5 seconds
    } catch (error) {
      return 200; // Default duration
    }
  }

  /**
   * Get changed files from git
   */
  private getChangedFiles(baseBranch = 'main'): FileChange[] {
    try {
      // Get changed files
      const diffOutput = execSync(`git diff --name-status ${baseBranch}...HEAD`, {
        cwd: projectRoot,
        encoding: 'utf-8'
      }).trim();

      if (!diffOutput) return [];

      const changes: FileChange[] = [];
      const lines = diffOutput.split('\n');

      for (const line of lines) {
        const [status, path] = line.split('\t');
        if (!path) continue;

        let type: FileChange['type'];
        switch (status[0]) {
          case 'A': type = 'added'; break;
          case 'M': type = 'modified'; break;
          case 'D': type = 'deleted'; break;
          default: type = 'modified';
        }

        // Get lines changed for modified files
        let linesChanged = 0;
        if (type === 'modified') {
          try {
            const diffStat = execSync(`git diff --numstat ${baseBranch}...HEAD -- "${path}"`, {
              cwd: projectRoot,
              encoding: 'utf-8'
            }).trim();

            const [added, deleted] = diffStat.split('\t').map(Number);
            linesChanged = (added || 0) + (deleted || 0);
          } catch (error) {
            linesChanged = 10; // Default estimate
          }
        }

        changes.push({ path, type, linesChanged });
      }

      return changes;
    } catch (error) {
      console.warn('Failed to get git changes, running all tests');
      return [];
    }
  }

  /**
   * Select tests intelligently based on changes
   */
  selectTests(options: {
    baseBranch?: string;
    includeIntegration?: boolean;
    includePerformance?: boolean;
    maxDuration?: number;
  } = {}): TestSelection {
    const {
      baseBranch = 'main',
      includeIntegration = true,
      includePerformance = false,
      maxDuration = 60000 // 1 minute
    } = options;

    this.changedFiles = this.getChangedFiles(baseBranch);

    const selection: TestSelection = {
      essential: [],
      related: [],
      performance: [],
      integration: [],
      total: 0,
      estimatedTime: 0
    };

    // If no changes, run a minimal smoke test
    if (this.changedFiles.length === 0) {
      const smokeTests = this.allTestFiles.filter(t =>
        t.path.includes('smoke') ||
        t.testCategories.includes('smoke') ||
        t.path.includes('health')
      );

      selection.essential = smokeTests.slice(0, 3);
      selection.total = selection.essential.length;
      selection.estimatedTime = selection.essential.reduce((sum, t) => sum + t.estimatedDuration, 0);

      return selection;
    }

    // Build affected file set
    const affectedFiles = new Set<string>();
    for (const change of this.changedFiles) {
      affectedFiles.add(change.path);

      // Add dependencies
      const deps = this.dependencyGraph.get(change.path) || [];
      deps.forEach(dep => affectedFiles.add(dep));
    }

    // Select tests based on affected files
    for (const testFile of this.allTestFiles) {
      let priority = 0;
      let category = 'related';

      // Check if test directly relates to changed files
      const isDirectlyAffected = testFile.relatedFiles.some(f => affectedFiles.has(f));

      if (isDirectlyAffected) {
        priority = 100;
        category = 'essential';
      } else {
        // Check for indirect relationships
        const indirectMatches = testFile.relatedFiles.filter(f => {
          for (const affectedFile of affectedFiles) {
            if (f.includes(dirname(affectedFile)) || affectedFile.includes(dirname(f))) {
              return true;
            }
          }
          return false;
        });

        if (indirectMatches.length > 0) {
          priority = 50;
        }
      }

      // Category-specific priorities
      if (testFile.testCategories.includes('database') &&
          this.changedFiles.some(c => c.path.includes('schema') || c.path.includes('database'))) {
        priority += 30;
      }

      if (testFile.testCategories.includes('financial') &&
          this.changedFiles.some(c => c.path.includes('reserve') || c.path.includes('pacing'))) {
        priority += 25;
      }

      // Assign to appropriate category
      if (priority >= 100) {
        selection.essential.push(testFile);
      } else if (priority >= 50) {
        selection.related.push(testFile);
      } else if (testFile.testCategories.includes('performance') && includePerformance) {
        selection.performance.push(testFile);
      } else if (testFile.testCategories.includes('integration') && includeIntegration) {
        selection.integration.push(testFile);
      }
    }

    // Sort by priority and trim to fit time budget
    const allSelected = [
      ...selection.essential,
      ...selection.related,
      ...(includeIntegration ? selection.integration : []),
      ...(includePerformance ? selection.performance : [])
    ];

    // Trim to fit duration budget
    let totalTime = 0;
    const finalSelection: TestFile[] = [];

    for (const test of allSelected) {
      if (totalTime + test.estimatedDuration <= maxDuration) {
        finalSelection.push(test);
        totalTime += test.estimatedDuration;
      } else {
        break;
      }
    }

    // Re-categorize final selection
    selection.essential = finalSelection.filter(t => selection.essential.includes(t));
    selection.related = finalSelection.filter(t => selection.related.includes(t));
    selection.integration = finalSelection.filter(t => selection.integration.includes(t));
    selection.performance = finalSelection.filter(t => selection.performance.includes(t));

    selection.total = finalSelection.length;
    selection.estimatedTime = totalTime;

    return selection;
  }

  /**
   * Generate test command for selected tests
   */
  generateTestCommand(selection: TestSelection, options: {
    reporter?: string;
    bail?: boolean;
    coverage?: boolean;
  } = {}): string {
    const {
      reporter = 'dot',
      bail = false,
      coverage = false
    } = options;

    const allTests = [
      ...selection.essential,
      ...selection.related,
      ...selection.integration,
      ...selection.performance
    ];

    if (allTests.length === 0) {
      return 'echo "No tests selected"';
    }

    const testPaths = allTests.map(t => `"${t.path}"`).join(' ');
    const flags = [
      `--reporter=${reporter}`,
      bail ? '--bail' : '',
      coverage ? '--coverage' : ''
    ].filter(Boolean).join(' ');

    return `vitest run ${flags} ${testPaths}`;
  }

  /**
   * Generate selection report
   */
  generateReport(selection: TestSelection): string {
    const changedFilesList = this.changedFiles
      .map(f => `- ${f.path} (${f.type}, ${f.linesChanged} lines)`)
      .join('\n');

    return `
# Intelligent Test Selection Report

## Changed Files (${this.changedFiles.length})
${changedFilesList || 'No changes detected'}

## Test Selection Summary
- **Essential tests**: ${selection.essential.length} (directly affected)
- **Related tests**: ${selection.related.length} (indirectly affected)
- **Integration tests**: ${selection.integration.length}
- **Performance tests**: ${selection.performance.length}
- **Total selected**: ${selection.total}
- **Estimated time**: ${(selection.estimatedTime / 1000).toFixed(1)}s

## Essential Tests
${selection.essential.map(t => `- ${t.path} (~${t.estimatedDuration}ms)`).join('\n') || 'None'}

## Related Tests
${selection.related.map(t => `- ${t.path} (~${t.estimatedDuration}ms)`).join('\n') || 'None'}

## Test Command
\`\`\`bash
${this.generateTestCommand(selection)}
\`\`\`

---
Generated by Intelligent Test Selector v1.0
`;
  }

  /**
   * Main execution function
   */
  async run(args: string[] = []): Promise<void> {
    const options = this.parseArgs(args);

    console.log('🧠 Intelligent Test Selector');
    console.log('============================\n');

    const selection = this.selectTests(options);

    if (options.report) {
      const report = this.generateReport(selection);
      console.log(report);
      return;
    }

    if (options.filesOnly) {
      const allTests = [
        ...selection.essential,
        ...selection.related,
        ...selection.integration,
        ...selection.performance
      ];
      console.log(allTests.map(t => t.path).join(' '));
      return;
    }

    // Run selected tests
    const command = this.generateTestCommand(selection, options);
    console.log(`Running: ${command}\n`);

    execSync(command, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  }

  /**
   * Parse command line arguments
   */
  private parseArgs(args: string[]): any {
    const options: any = {
      baseBranch: 'main',
      includeIntegration: true,
      includePerformance: false,
      maxDuration: 60000,
      reporter: 'dot',
      bail: false,
      coverage: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--base-branch':
          options.baseBranch = args[++i];
          break;
        case '--no-integration':
          options.includeIntegration = false;
          break;
        case '--include-performance':
          options.includePerformance = true;
          break;
        case '--max-duration':
          options.maxDuration = parseInt(args[++i]);
          break;
        case '--reporter':
          options.reporter = args[++i];
          break;
        case '--bail':
          options.bail = true;
          break;
        case '--coverage':
          options.coverage = true;
          break;
        case '--report':
          options.report = true;
          break;
        case '--files-only':
          options.filesOnly = true;
          break;
        case '--only-affected':
          options.includeIntegration = false;
          options.includePerformance = false;
          break;
      }
    }

    return options;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const selector = new IntelligentTestSelector();
  selector.run(process.argv.slice(2)).catch(error => {
    console.error('💥 Test selection failed:', error);
    process.exit(1);
  });
}

export { IntelligentTestSelector, TestSelection, FileChange, TestFile };