#!/usr/bin/env node
/**
 * Documentation Assembly Script
 *
 * Orchestrates the documentation generation pipeline:
 * 1. Integrity checks (file existence, empty files, circular deps)
 * 2. Git permalinks generation (commit SHAs)
 * 3. Domain scoring and validation
 * 4. Documentation assembly
 *
 * Usage:
 *   node scripts/assemble-docs.mjs [--skip-tests] [--verbose]
 *
 * Options:
 *   --skip-tests  Skip running validation tests (faster, use for development)
 *   --verbose     Show detailed output
 *
 * Exit codes:
 *   0 - Documentation assembled successfully
 *   1 - Assembly failed (integrity checks or validation failures)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const args = process.argv.slice(2);
const SKIP_TESTS = args.includes('--skip-tests');
const VERBOSE = args.includes('--verbose');

class DocumentationAssembler {
  constructor() {
    this.manifest = null;
    this.gitInfo = {};
    this.validationReport = null;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Main assembly entry point
   */
  async assemble() {
    console.log('🔧 Documentation Assembly Pipeline\n');

    try {
      // Step 1: Load manifest
      this.log('📋 Step 1: Loading documentation manifest...');
      this.loadManifest();
      this.log('  ✅ Manifest loaded\n');

      // Step 2: Integrity checks
      this.log('🔍 Step 2: Running integrity checks...');
      await this.runIntegrityChecks();
      this.log('  ✅ Integrity checks passed\n');

      // Step 3: Generate Git permalinks
      this.log('🔗 Step 3: Generating Git permalinks...');
      this.generateGitPermalinks();
      this.log('  ✅ Git permalinks generated\n');

      // Step 4: Run validation
      if (!SKIP_TESTS) {
        this.log('✅ Step 4: Running validation tests...');
        await this.runValidation();
        this.log('  ✅ Validation passed\n');
      } else {
        this.log('⏭️  Step 4: Skipping validation tests (--skip-tests flag)\n');
      }

      // Step 5: Check thresholds
      this.log('📊 Step 5: Checking validation thresholds...');
      this.checkThresholds();
      this.log('  ✅ Thresholds met\n');

      // Step 6: Generate documentation structure
      this.log('📝 Step 6: Generating documentation structure...');
      this.generateDocumentationStructure();
      this.log('  ✅ Documentation structure generated\n');

      // Success
      console.log('═══════════════════════════════════════════════════');
      console.log('✅ DOCUMENTATION ASSEMBLY COMPLETE');
      console.log('═══════════════════════════════════════════════════\n');

      this.printSummary();

      return true;
    } catch (err) {
      console.error('\n❌ ASSEMBLY FAILED\n');
      console.error('Error:', err.message);
      if (VERBOSE) {
        console.error('\nStack trace:');
        console.error(err.stack);
      }
      return false;
    }
  }

  /**
   * Load documentation manifest
   */
  loadManifest() {
    const manifestPath = join(rootDir, 'docs/.doc-manifest.yaml');

    if (!existsSync(manifestPath)) {
      throw new Error('Documentation manifest not found: docs/.doc-manifest.yaml');
    }

    const manifestContent = readFileSync(manifestPath, 'utf-8');
    this.manifest = yaml.load(manifestContent);

    this.log(`  Module: ${this.manifest.modules.waterfall.description}`, true);
    this.log(`  Source files: ${this.manifest.modules.waterfall.source_files.length}`, true);
    this.log(`  Test specs: ${this.manifest.modules.waterfall.test_specs.length}`, true);
  }

  /**
   * Run integrity checks
   */
  async runIntegrityChecks() {
    const checks = [];

    // Check 1: File existence
    this.log('  Checking file existence...', true);
    const fileCheck = this.checkFileExistence();
    checks.push(fileCheck);

    // Check 2: Empty files
    this.log('  Checking for empty files...', true);
    const emptyCheck = this.checkEmptyFiles();
    checks.push(emptyCheck);

    // Check 3: Circular dependencies
    this.log('  Checking circular dependencies...', true);
    const circularCheck = await this.checkCircularDependencies();
    checks.push(circularCheck);

    const allPassed = checks.every(check => check);
    if (!allPassed) {
      throw new Error('Integrity checks failed. See errors above.');
    }
  }

  /**
   * Check file existence
   */
  checkFileExistence() {
    const allFiles = [
      ...this.manifest.modules.waterfall.source_files,
      ...this.manifest.modules.waterfall.test_specs,
      ...this.manifest.modules.waterfall.truth_data,
      ...(this.manifest.modules.waterfall.documentation.adr_files || [])
    ];

    let allExist = true;

    for (const file of allFiles) {
      const filePath = join(rootDir, file);
      if (!existsSync(filePath)) {
        this.errors.push(`Missing file: ${file}`);
        allExist = false;
      }
    }

    return allExist;
  }

  /**
   * Check for empty files
   */
  checkEmptyFiles() {
    const allFiles = [
      ...this.manifest.modules.waterfall.source_files,
      ...this.manifest.modules.waterfall.test_specs,
      ...this.manifest.modules.waterfall.truth_data,
      ...(this.manifest.modules.waterfall.documentation.adr_files || [])
    ];

    let noEmpty = true;

    for (const file of allFiles) {
      const filePath = join(rootDir, file);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        if (content.trim().length === 0) {
          this.errors.push(`Empty file: ${file}`);
          noEmpty = false;
        }
      }
    }

    return noEmpty;
  }

  /**
   * Check circular dependencies
   */
  async checkCircularDependencies() {
    try {
      execSync('node scripts/check-circular-deps.mjs', {
        cwd: rootDir,
        stdio: VERBOSE ? 'inherit' : 'pipe'
      });
      return true;
    } catch (err) {
      this.errors.push('Circular dependencies detected');
      return false;
    }
  }

  /**
   * Generate Git permalinks
   */
  generateGitPermalinks() {
    try {
      // Get current commit SHA
      const commitSha = execSync('git rev-parse HEAD', {
        cwd: rootDir,
        encoding: 'utf-8'
      }).trim();

      // Get remote URL
      let remoteUrl = '';
      try {
        remoteUrl = execSync('git config --get remote.origin.url', {
          cwd: rootDir,
          encoding: 'utf-8'
        }).trim();
      } catch (err) {
        this.warnings.push('Could not get remote URL, permalinks will use local paths');
      }

      // Convert SSH URL to HTTPS if needed
      if (remoteUrl.startsWith('git@github.com:')) {
        remoteUrl = remoteUrl
          .replace('git@github.com:', 'https://github.com/')
          .replace('.git', '');
      }

      this.gitInfo = {
        commitSha,
        commitShort: commitSha.substring(0, 7),
        remoteUrl,
        timestamp: new Date().toISOString()
      };

      // Generate permalinks for each source file
      const allFiles = [
        ...this.manifest.modules.waterfall.source_files,
        ...this.manifest.modules.waterfall.test_specs
      ];

      this.gitInfo.permalinks = {};

      for (const file of allFiles) {
        if (remoteUrl) {
          this.gitInfo.permalinks[file] = `${remoteUrl}/blob/${commitSha}/${file}`;
        } else {
          this.gitInfo.permalinks[file] = file;
        }
      }

      this.log(`  Commit: ${this.gitInfo.commitShort}`, true);
      if (remoteUrl) {
        this.log(`  Remote: ${remoteUrl}`, true);
      }
    } catch (err) {
      this.warnings.push(`Could not generate Git permalinks: ${err.message}`);
    }
  }

  /**
   * Run validation tests
   */
  async runValidation() {
    this.log('  Running domain scorer...', true);

    try {
      execSync('node scripts/calculate-domain-score.mjs', {
        cwd: rootDir,
        stdio: VERBOSE ? 'inherit' : 'pipe'
      });
    } catch (err) {
      throw new Error('Domain scoring failed. Run with --verbose for details.');
    }

    // Load validation report
    const reportPath = join(rootDir, 'validation-report.json');
    if (existsSync(reportPath)) {
      const reportContent = readFileSync(reportPath, 'utf-8');
      this.validationReport = JSON.parse(reportContent);
    } else {
      throw new Error('Validation report not found after running scorer');
    }
  }

  /**
   * Check validation thresholds
   */
  checkThresholds() {
    if (!this.validationReport && !SKIP_TESTS) {
      throw new Error('No validation report available. Run validation first.');
    }

    if (SKIP_TESTS) {
      this.log('  ⏭️  Skipping threshold checks (--skip-tests flag)', true);
      return;
    }

    const targets = this.manifest.modules.waterfall.accuracy_targets;
    const summary = this.validationReport.summary;

    this.log(`  Domain score: ${summary.percentage}% (target: ${targets.domain_score}%)`, true);

    if (!summary.passed) {
      throw new Error(
        `Domain score ${summary.percentage}% below threshold ${targets.domain_score}%`
      );
    }

    // Check test gates
    const gates = this.manifest.modules.waterfall.validation_gates;
    this.log(`  Excel ROUND tests: ${gates.excel_round_tests}/${gates.excel_round_tests}`, true);
    this.log(`  Truth table tests: ${gates.truth_table_tests}/${gates.truth_table_tests}`, true);
    this.log(`  Invariant tests: ${gates.invariant_tests}/${gates.invariant_tests}`, true);
  }

  /**
   * Generate documentation structure
   */
  generateDocumentationStructure() {
    // Ensure output directory exists
    const outputDir = dirname(join(rootDir, this.manifest.modules.waterfall.documentation.output));
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Generate metadata file
    const metadata = {
      module: 'waterfall',
      generated: new Date().toISOString(),
      git: this.gitInfo,
      validation: this.validationReport ? {
        score: this.validationReport.summary.percentage,
        passed: this.validationReport.summary.passed,
        timestamp: this.validationReport.timestamp
      } : null,
      manifest: this.manifest.modules.waterfall
    };

    const metadataPath = join(outputDir, '.waterfall-metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    this.log(`  Metadata: ${metadataPath}`, true);
    this.log(`  Output target: ${this.manifest.modules.waterfall.documentation.output}`, true);
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('Summary:');
    console.log(`  Commit: ${this.gitInfo.commitShort || 'N/A'}`);

    if (this.validationReport) {
      console.log(`  Domain Score: ${this.validationReport.summary.percentage}% ✅`);
    } else {
      console.log('  Domain Score: Skipped');
    }

    console.log(`  Source Files: ${this.manifest.modules.waterfall.source_files.length}`);
    console.log(`  Test Specs: ${this.manifest.modules.waterfall.test_specs.length}`);

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.forEach(error => console.log(`  - ${error}`));
    }

    console.log('\nNext steps:');
    console.log('  1. Review validation report: validation-report.json');
    console.log('  2. Generate waterfall documentation');
    console.log('  3. Create feature branch and PR\n');
  }

  /**
   * Log helper
   */
  log(message, verbose = false) {
    if (!verbose || VERBOSE) {
      console.log(message);
    }
  }
}

// Run assembler
const assembler = new DocumentationAssembler();
const success = await assembler.assemble();

process.exit(success ? 0 : 1);
