#!/usr/bin/env tsx

/**
 * CLI runner for VC Fund Tool Evaluation Framework
 *
 * Usage:
 *   npm run evaluate:tools                    # Run all evaluations
 *   npm run evaluate:tools waterfall          # Run waterfall tests only
 *   npm run evaluate:tools -- --watch         # Watch mode for development
 *   npm run evaluate:tools -- --output report # Save report to file
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  runEvaluationSuite,
  generateMarkdownReport,
  parseEvaluationFile,
  EVALUATION_TOOLS,
} from './waterfall-evaluator';

const program = new Command();

program
  .name('evaluate-tools')
  .description('Run tool evaluation suite for VC Fund Modeling Platform')
  .version('1.0.0');

program
  .argument('[category]', 'Category to test (waterfall, reserves, pacing, all)', 'all')
  .option('-o, --output <path>', 'Output path for results JSON')
  .option('-r, --report <path>', 'Generate markdown report')
  .option('-w, --watch', 'Watch mode for continuous testing')
  .option('-v, --verbose', 'Verbose output with detailed results')
  .option('--threshold <percent>', 'Minimum accuracy threshold to pass', '80')
  .action(async (category: string, options: any) => {
    const spinner = ora('Initializing evaluation framework...').start();

    try {
      // Determine which evaluation file to use
      const evaluationDir = path.join(__dirname, 'evaluations');
      let evaluationFile: string;

      if (category === 'all') {
        evaluationFile = path.join(evaluationDir, 'waterfall-tests.xml');
      } else {
        evaluationFile = path.join(evaluationDir, `${category}-tests.xml`);
      }

      // Check if file exists
      try {
        await fs.access(evaluationFile);
      } catch {
        spinner.fail(chalk.red(`Evaluation file not found: ${evaluationFile}`));

        // List available files
        const files = await fs.readdir(evaluationDir);
        const xmlFiles = files.filter((f) => f.endsWith('.xml'));

        if (xmlFiles.length > 0) {
          console.log(chalk.yellow('\nAvailable evaluation files:'));
          xmlFiles.forEach((f) => {
            const category = f.replace('-tests.xml', '');
            console.log(chalk.gray(`  - ${category}`));
          });
        }

        process.exit(1);
      }

      spinner.text = 'Loading evaluation tasks...';

      // Parse tasks to get count
      const tasks = await parseEvaluationFile(evaluationFile);

      if (tasks.length === 0) {
        spinner.fail(chalk.red('No evaluation tasks found in file'));
        process.exit(1);
      }

      spinner.text = `Running ${tasks.length} evaluation tasks...`;

      // Run evaluation suite
      const { results, summary } = await runEvaluationSuite(evaluationFile, options.output);

      spinner.stop();

      // Display results based on verbosity
      if (options.verbose) {
        displayDetailedResults(results, summary);
      } else {
        displaySummary(summary);
      }

      // Generate markdown report if requested
      if (options.report) {
        const report = generateMarkdownReport(results, summary);
        await fs.writeFile(options.report, report);
        console.log(chalk.green(`\n📄 Report saved to: ${options.report}`));
      }

      // Check threshold
      const threshold = parseFloat(options.threshold);
      if (summary.accuracy < threshold) {
        console.log(
          chalk.red(
            `\n❌ Evaluation failed: ${summary.accuracy.toFixed(1)}% accuracy is below ${threshold}% threshold`
          )
        );
        process.exit(1);
      } else {
        console.log(
          chalk.green(`\n✅ Evaluation passed: ${summary.accuracy.toFixed(1)}% accuracy`)
        );
      }

      // Watch mode
      if (options.watch) {
        console.log(chalk.cyan('\n👀 Watching for changes...'));
        await watchMode(evaluationFile, options);
      }
    } catch (error) {
      spinner.fail(chalk.red('Evaluation failed'));
      console.error(error);
      process.exit(1);
    }
  });

// Helper function to display summary
function displaySummary(summary: any) {
  console.log(chalk.bold('\n📊 Evaluation Summary\n'));
  console.log(chalk.white(`Total Tasks: ${summary.total}`));
  console.log(chalk.green(`Passed: ${summary.passed}`));
  console.log(chalk.red(`Failed: ${summary.failed}`));
  console.log(chalk.cyan(`Accuracy: ${summary.accuracy.toFixed(1)}%`));
  console.log(chalk.gray(`Avg Duration: ${summary.avgDuration.toFixed(0)}ms`));

  if (Object.keys(summary.byCategory).length > 1) {
    console.log(chalk.bold('\n📁 By Category:'));
    for (const [category, stats] of Object.entries(summary.byCategory)) {
      const catStats = stats as { total: number; passed: number };
      const accuracy = (catStats.passed / catStats.total) * 100;
      const color = accuracy >= 80 ? chalk.green : chalk.yellow;
      console.log(
        `  ${category}: ${color(`${catStats.passed}/${catStats.total} (${accuracy.toFixed(1)}%)`)}`
      );
    }
  }
}

// Helper function to display detailed results
function displayDetailedResults(results: any[], summary: any) {
  displaySummary(summary);

  console.log(chalk.bold('\n📝 Detailed Results:\n'));

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? chalk.green : chalk.red;

    console.log(`${icon} ${chalk.bold(result.taskId)}`);
    console.log(chalk.gray(`  Category: ${result.category}`));
    console.log(chalk.gray(`  Prompt: ${result.prompt.substring(0, 80)}...`));

    if (!result.passed) {
      console.log(chalk.yellow(`  Expected: ${result.expected}`));
      console.log(chalk.red(`  Actual: ${result.actual || 'N/A'}`));

      if (result.error) {
        console.log(chalk.red(`  Error: ${result.error}`));
      }
    }

    console.log(chalk.gray(`  Duration: ${result.duration}ms`));

    if (result.toolCalls?.length > 0) {
      console.log(chalk.gray(`  Tools: ${result.toolCalls.map((c: any) => c.tool).join(', ')}`));
    }

    console.log();
  }
}

// Watch mode implementation
async function watchMode(evaluationFile: string, options: any) {
  const fs = await import('fs');
  const chokidar = await import('chokidar');

  // Watch the evaluation file and related source files
  const watcher = chokidar.watch([
    evaluationFile,
    path.join(__dirname, '*.ts'),
    path.join(__dirname, '../../client/src/lib/waterfall.ts'),
    path.join(__dirname, '../../shared/schemas/waterfall-policy.ts'),
  ]);

  watcher.on('change', async (filepath) => {
    console.clear();
    console.log(chalk.cyan(`\n🔄 File changed: ${path.basename(filepath)}`));
    console.log(chalk.gray('Re-running evaluation...\n'));

    try {
      const { results, summary } = await runEvaluationSuite(evaluationFile, options.output);

      if (options.verbose) {
        displayDetailedResults(results, summary);
      } else {
        displaySummary(summary);
      }
    } catch (error) {
      console.error(chalk.red('Evaluation error:'), error);
    }
  });
}

// Add custom evaluation command
program
  .command('create <name>')
  .description('Create a new evaluation test file')
  .option('-c, --category <category>', 'Test category', 'custom')
  .action(async (name: string, options: any) => {
    const template = `<?xml version="1.0" encoding="UTF-8"?>
<evaluations>
  <!-- ${name} Evaluation Tests -->
  <task id="${name}-1">
    <description>Sample ${name} test</description>
    <category>${options.category}</category>
    <prompt>Your prompt here</prompt>
    <response>Expected response</response>
  </task>
</evaluations>`;

    const filepath = path.join(__dirname, 'evaluations', `${name}-tests.xml`);
    await fs.writeFile(filepath, template);
    console.log(chalk.green(`✅ Created evaluation file: ${filepath}`));
  });

// Add comparison command
program
  .command('compare <file1> <file2>')
  .description('Compare results from two evaluation runs')
  .action(async (file1: string, file2: string) => {
    try {
      const results1 = JSON.parse(await fs.readFile(file1, 'utf-8'));
      const results2 = JSON.parse(await fs.readFile(file2, 'utf-8'));

      console.log(chalk.bold('\n📊 Evaluation Comparison\n'));

      console.log(chalk.cyan('File 1:'), file1);
      console.log(`  Accuracy: ${results1.summary.accuracy.toFixed(1)}%`);
      console.log(`  Avg Duration: ${results1.summary.avgDuration.toFixed(0)}ms`);

      console.log(chalk.cyan('\nFile 2:'), file2);
      console.log(`  Accuracy: ${results2.summary.accuracy.toFixed(1)}%`);
      console.log(`  Avg Duration: ${results2.summary.avgDuration.toFixed(0)}ms`);

      const accuracyDiff = results2.summary.accuracy - results1.summary.accuracy;
      const durationDiff = results2.summary.avgDuration - results1.summary.avgDuration;

      console.log(chalk.bold('\nDifferences:'));
      const accColor = accuracyDiff > 0 ? chalk.green : chalk.red;
      const durColor = durationDiff < 0 ? chalk.green : chalk.red;

      console.log(
        `  Accuracy: ${accColor(`${accuracyDiff > 0 ? '+' : ''}${accuracyDiff.toFixed(1)}%`)}`
      );
      console.log(
        `  Duration: ${durColor(`${durationDiff > 0 ? '+' : ''}${durationDiff.toFixed(0)}ms`)}`
      );

      // Find specific test differences
      const results1Map = new Map(results1.results.map((r: any) => [r.taskId, r]));
      const results2Map = new Map(results2.results.map((r: any) => [r.taskId, r]));

      const improvements: string[] = [];
      const regressions: string[] = [];

      for (const [taskId, r1] of results1Map) {
        const r2 = results2Map.get(taskId);
        if (r2) {
          if (!r1.passed && r2.passed) {
            improvements.push(taskId);
          } else if (r1.passed && !r2.passed) {
            regressions.push(taskId);
          }
        }
      }

      if (improvements.length > 0) {
        console.log(chalk.green('\n✅ Improvements:'));
        improvements.forEach((id) => console.log(`  - ${id}`));
      }

      if (regressions.length > 0) {
        console.log(chalk.red('\n❌ Regressions:'));
        regressions.forEach((id) => console.log(`  - ${id}`));
      }
    } catch (error) {
      console.error(chalk.red('Comparison failed:'), error);
      process.exit(1);
    }
  });

program.parse(process.argv);
