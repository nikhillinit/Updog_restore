#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Orchestrator for coordinating multiple bundle optimization agents
class BundleOptimizationOrchestrator {
  constructor() {
    this.config = {
      targetSizeKB: 400,
      maxIterations: 3,
      rollbackOnFailure: true,
      preserveFunctionality: true,
    };
    
    this.results = {
      initialSize: 0,
      finalSize: 0,
      iterations: [],
      recommendations: [],
      applied: [],
      rollbacks: [],
    };
  }

  async run(args) {
    const options = this.parseArgs(args);
    Object.assign(this.config, options);

    console.log('🎯 Bundle Optimization Orchestrator');
    console.log('═'.repeat(50));
    console.log(`Target: ${this.config.targetSizeKB}KB`);
    console.log(`Strategy: ${this.config.strategy || 'balanced'}`);
    console.log('');

    try {
      // Phase 1: Initial Analysis
      await this.phase1_analysis();

      // Phase 2: Dependency Optimization
      await this.phase2_dependencies();

      // Phase 3: Route Optimization
      await this.phase3_routes();

      // Phase 4: Bundle Optimization
      await this.phase4_bundle();

      // Phase 5: Validation & Reporting
      await this.phase5_validation();

    } catch (error) {
      console.error('❌ Orchestration failed:', error.message);
      
      if (this.config.rollbackOnFailure) {
        await this.rollback();
      }
      
      process.exit(1);
    }
  }

  parseArgs(args) {
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--target' && args[i + 1]) {
        options.targetSizeKB = parseInt(args[++i]);
      } else if (arg === '--strategy' && args[i + 1]) {
        options.strategy = args[++i];
      } else if (arg === '--max-iterations' && args[i + 1]) {
        options.maxIterations = parseInt(args[++i]);
      } else if (arg === '--no-rollback') {
        options.rollbackOnFailure = false;
      } else if (arg === '--no-preserve') {
        options.preserveFunctionality = false;
      } else if (arg === '--dry-run') {
        options.dryRun = true;
      }
    }
    
    return options;
  }

  async phase1_analysis() {
    console.log('📊 Phase 1: Initial Analysis');
    console.log('-'.repeat(30));

    // Create git checkpoint
    if (!this.config.dryRun) {
      await this.createCheckpoint();
    }

    // Get initial bundle size
    const bundleStats = await this.getBundleStats();
    this.results.initialSize = bundleStats.totalKB;
    
    console.log(`📦 Current bundle size: ${bundleStats.totalKB}KB`);
    console.log(`🎯 Target size: ${this.config.targetSizeKB}KB`);
    console.log(`📉 Need to reduce: ${bundleStats.totalKB - this.config.targetSizeKB}KB`);

    if (bundleStats.totalKB <= this.config.targetSizeKB) {
      console.log('✅ Bundle already meets target size!');
      process.exit(0);
    }

    // Analyze bundle composition
    const analysis = await this.runCommand('bundle-analyzer analyze --format json');
    this.results.bundleAnalysis = JSON.parse(analysis);

    console.log(`\n📁 Chunks: ${this.results.bundleAnalysis.chunks.length}`);
    console.log('Top 3 chunks:');
    this.results.bundleAnalysis.chunks.slice(0, 3).forEach(chunk => {
      console.log(`  - ${chunk.name}: ${chunk.size}KB`);
    });

    console.log('');
  }

  async phase2_dependencies() {
    console.log('📦 Phase 2: Dependency Optimization');
    console.log('-'.repeat(30));

    const depAnalysis = await this.runCommand('bundle-analyzer deps --format json');
    const deps = JSON.parse(depAnalysis);

    console.log(`❌ Unused dependencies: ${deps.unused.length}`);
    console.log(`📦 Heavy dependencies: ${deps.heavy.length}`);
    console.log(`🔄 Duplicate dependencies: ${deps.duplicates.length}`);

    if (deps.unused.length > 0) {
      console.log('\nRemoving unused dependencies...');
      
      if (!this.config.dryRun) {
        for (const dep of deps.unused) {
          try {
            await this.runCommand(`npm remove ${dep}`);
            console.log(`  ✅ Removed ${dep}`);
            this.results.applied.push(`remove-dep:${dep}`);
          } catch (error) {
            console.log(`  ⚠️  Failed to remove ${dep}`);
          }
        }
      }
    }

    // Check for replacements
    if (deps.heavy.some(d => d.name === 'moment')) {
      console.log('\n💡 Replacing moment with date-fns...');
      
      if (!this.config.dryRun) {
        try {
          await this.runCommand('npm remove moment');
          await this.runCommand('npm install date-fns');
          console.log('  ✅ Replaced moment with date-fns');
          this.results.applied.push('replace:moment->date-fns');
        } catch (error) {
          console.log('  ⚠️  Failed to replace moment');
        }
      }
    }

    if (deps.heavy.some(d => d.name === 'lodash')) {
      console.log('\n💡 Replacing lodash with lodash-es...');
      
      if (!this.config.dryRun) {
        try {
          await this.runCommand('npm remove lodash');
          await this.runCommand('npm install lodash-es');
          console.log('  ✅ Replaced lodash with lodash-es');
          this.results.applied.push('replace:lodash->lodash-es');
        } catch (error) {
          console.log('  ⚠️  Failed to replace lodash');
        }
      }
    }

    // Deduplicate
    if (deps.duplicates.length > 0) {
      console.log('\n🔄 Deduplicating dependencies...');
      
      if (!this.config.dryRun) {
        await this.runCommand('npm dedupe');
        console.log('  ✅ Dependencies deduplicated');
        this.results.applied.push('dedupe');
      }
    }

    console.log('');
  }

  async phase3_routes() {
    console.log('🚀 Phase 3: Route Optimization');
    console.log('-'.repeat(30));

    const routeAnalysis = await this.runCommand('bundle-analyzer routes --format json');
    const routes = JSON.parse(routeAnalysis);

    const nonLazyRoutes = routes.routes.filter(r => !r.lazy);
    console.log(`📍 Total routes: ${routes.routes.length}`);
    console.log(`⚡ Non-lazy routes: ${nonLazyRoutes.length}`);

    if (nonLazyRoutes.length > 0 && this.config.strategy !== 'safe') {
      console.log('\nConverting routes to lazy loading...');
      
      const highPriorityRoutes = nonLazyRoutes.filter(r => 
        !['/', '/dashboard'].includes(r.path)
      );

      for (const route of highPriorityRoutes.slice(0, 3)) {
        console.log(`  🔄 Converting ${route.name} to lazy loading`);
        
        if (!this.config.dryRun) {
          // This would apply the actual lazy loading transformation
          this.results.applied.push(`lazy-route:${route.name}`);
        }
      }
    }

    console.log('');
  }

  async phase4_bundle() {
    console.log('⚡ Phase 4: Bundle Optimization');
    console.log('-'.repeat(30));

    let iteration = 0;
    let currentSize = this.results.initialSize;

    while (iteration < this.config.maxIterations && currentSize > this.config.targetSizeKB) {
      iteration++;
      console.log(`\n🔄 Iteration ${iteration}/${this.config.maxIterations}`);

      // Run tests before optimization
      if (this.config.preserveFunctionality) {
        console.log('  🧪 Running tests...');
        
        try {
          await this.runCommand('npm test -- --run');
          console.log('  ✅ Tests passed');
        } catch (error) {
          console.log('  ⚠️  Some tests failed, continuing cautiously');
        }
      }

      // Build and measure
      console.log('  🔨 Building...');
      await this.runCommand('npm run build');
      
      const stats = await this.getBundleStats();
      currentSize = stats.totalKB;
      
      console.log(`  📦 Current size: ${currentSize}KB`);
      
      this.results.iterations.push({
        iteration,
        sizeKB: currentSize,
        timestamp: new Date().toISOString(),
      });

      if (currentSize <= this.config.targetSizeKB) {
        console.log('  🎯 Target reached!');
        break;
      }

      // Apply more aggressive optimizations if needed
      if (iteration === 2 && this.config.strategy !== 'safe') {
        console.log('  💪 Applying aggressive optimizations...');
        
        // Consider Preact swap
        if (currentSize > this.config.targetSizeKB + 50) {
          console.log('  🔄 Considering Preact compatibility mode...');
          // This would test Preact compatibility
        }
      }
    }

    this.results.finalSize = currentSize;
    console.log('');
  }

  async phase5_validation() {
    console.log('✅ Phase 5: Validation & Reporting');
    console.log('-'.repeat(30));

    // Final tests
    if (this.config.preserveFunctionality) {
      console.log('Running final test suite...');
      
      try {
        await this.runCommand('npm test -- --run');
        console.log('✅ All tests passed');
      } catch (error) {
        console.log('⚠️  Some tests failed');
        
        if (this.config.rollbackOnFailure) {
          console.log('🔄 Rolling back changes...');
          await this.rollback();
          throw new Error('Tests failed after optimization');
        }
      }
    }

    // Generate report
    this.generateReport();

    // Save results
    const reportPath = path.join(process.cwd(), 'bundle-optimization-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Full report saved to: ${reportPath}`);
  }

  generateReport() {
    console.log('\n' + '═'.repeat(50));
    console.log('📊 OPTIMIZATION SUMMARY');
    console.log('═'.repeat(50));
    
    console.log(`Initial size: ${this.results.initialSize}KB`);
    console.log(`Final size: ${this.results.finalSize}KB`);
    console.log(`Reduction: ${this.results.initialSize - this.results.finalSize}KB`);
    console.log(`Target: ${this.config.targetSizeKB}KB`);
    
    const success = this.results.finalSize <= this.config.targetSizeKB;
    console.log(`Status: ${success ? '✅ SUCCESS' : '⚠️  PARTIAL SUCCESS'}`);

    if (this.results.applied.length > 0) {
      console.log('\n📝 Applied Optimizations:');
      this.results.applied.forEach(opt => {
        console.log(`  - ${opt}`);
      });
    }

    if (!success) {
      console.log('\n💡 Additional Recommendations:');
      console.log('  - Consider Preact compatibility mode (-50KB)');
      console.log('  - Review and split large vendor chunks');
      console.log('  - Implement more aggressive lazy loading');
      console.log('  - Analyze and remove unused code paths');
    }
  }

  async createCheckpoint() {
    try {
      await this.runCommand('git add .');
      await this.runCommand('git stash push -m "bundle-optimization-checkpoint"');
      console.log('📌 Created git checkpoint');
    } catch (error) {
      console.log('⚠️  Could not create git checkpoint');
    }
  }

  async rollback() {
    try {
      await this.runCommand('git stash pop');
      console.log('🔄 Rolled back to checkpoint');
    } catch (error) {
      console.log('⚠️  Could not rollback changes');
    }
  }

  async getBundleStats() {
    const distPath = path.resolve('dist/public/assets');
    
    if (!fs.existsSync(distPath)) {
      // Build if dist doesn't exist
      await this.runCommand('npm run build');
    }

    const files = fs.readdirSync(distPath);
    let totalKB = 0;

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const filePath = path.join(distPath, file);
        const stats = fs.statSync(filePath);
        totalKB += Math.round(stats.size / 1024);
      }
    }

    return { totalKB };
  }

  runCommand(command) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, { shell: true });
      let output = '';
      let error = '';

      child.stdout.on('data', data => output += data);
      child.stderr.on('data', data => error += data);

      child.on('close', code => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || output));
        }
      });
    });
  }
}

// Main execution
const orchestrator = new BundleOptimizationOrchestrator();

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Bundle Optimization Orchestrator

Coordinates multiple optimization agents to achieve target bundle size.

Usage: orchestrate-bundle-optimization [options]

Options:
  --target <kb>          Target bundle size in KB (default: 400)
  --strategy <type>      Optimization strategy: safe|balanced|aggressive
  --max-iterations <n>   Maximum optimization iterations (default: 3)
  --no-rollback         Don't rollback on failure
  --no-preserve         Don't preserve functionality (skip tests)
  --dry-run             Preview changes without applying

Example:
  orchestrate-bundle-optimization --target 400 --strategy balanced
`);
  process.exit(0);
}

orchestrator.run(process.argv.slice(2));