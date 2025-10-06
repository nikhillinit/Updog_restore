#!/usr/bin/env node
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundle analysis gateway for AI agents
class BundleAnalyzerGateway {
  constructor() {
    this.commands = {
      'analyze': this.analyzeBundle.bind(this),
      'optimize': this.optimizeBundle.bind(this),
      'deps': this.analyzeDependencies.bind(this),
      'routes': this.optimizeRoutes.bind(this),
      'monitor': this.monitorBundle.bind(this),
      'report': this.generateReport.bind(this),
    };
  }

  async run(args) {
    const command = args[0];
    const options = this.parseArgs(args.slice(1));

    if (!command || command === 'help') {
      this.showHelp();
      return;
    }

    if (!this.commands[command]) {
      console.error(`Unknown command: ${command}`);
      this.showHelp();
      process.exit(1);
    }

    try {
      await this.commands[command](options);
    } catch (error) {
      console.error(`Error executing ${command}:`, error.message);
      process.exit(1);
    }
  }

  parseArgs(args) {
    const options = {
      target: null,
      strategy: 'balanced',
      format: 'json',
      output: null,
      verbose: false,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--target' && args[i + 1]) {
        options.target = parseInt(args[++i]);
      } else if (arg === '--strategy' && args[i + 1]) {
        options.strategy = args[++i];
      } else if (arg === '--format' && args[i + 1]) {
        options.format = args[++i];
      } else if (arg === '--output' && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      }
    }

    return options;
  }

  async analyzeBundle(options) {
    console.log('🔍 Analyzing bundle...');
    
    // Build the project first
    await this.exec('npm run build');
    
    // Analyze bundle composition
    const analysis = await this.getBundleAnalysis();
    
    // Format output
    if (options.format === 'json') {
      const output = JSON.stringify(analysis, null, 2);
      
      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`✅ Analysis saved to ${options.output}`);
      } else {
        console.log(output);
      }
    } else {
      this.printAnalysis(analysis);
    }

    return analysis;
  }

  async optimizeBundle(options) {
    console.log('⚡ Starting bundle optimization...');
    
    const targetKB = options.target || 400;
    
    // Run the bundle optimization agent
    const agentPath = path.resolve(__dirname, '../../packages/bundle-optimization-agent/dist/cli.js');
    
    const result = await this.exec(`node ${agentPath} --target ${targetKB} --strategy ${options.strategy}`);
    
    if (options.verbose) {
      console.log(result);
    }

    console.log(`✅ Optimization complete. Target: ${targetKB}KB`);
  }

  async analyzeDependencies(options) {
    console.log('📦 Analyzing dependencies...');
    
    // Check for unused dependencies
    const unused = await this.findUnusedDeps();
    
    // Check for heavy dependencies
    const heavy = await this.findHeavyDeps();
    
    // Check for duplicates
    const duplicates = await this.findDuplicateDeps();
    
    const analysis = {
      unused,
      heavy,
      duplicates,
      recommendations: this.generateDepRecommendations({ unused, heavy, duplicates }),
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      this.printDepAnalysis(analysis);
    }

    return analysis;
  }

  async optimizeRoutes(options) {
    console.log('🚀 Optimizing routes...');
    
    // Analyze current route setup
    const routes = await this.analyzeRoutesSetup();
    
    // Generate optimization plan
    const optimizations = this.generateRouteOptimizations(routes);
    
    if (options.verbose) {
      console.log('Current routes:', routes);
      console.log('Optimizations:', optimizations);
    }

    // Apply optimizations if confirmed
    if (options.apply) {
      await this.applyRouteOptimizations(optimizations);
      console.log('✅ Route optimizations applied');
    } else {
      console.log('💡 Run with --apply to implement optimizations');
    }

    return { routes, optimizations };
  }

  async monitorBundle(options) {
    console.log('📊 Starting bundle monitoring...');
    
    const interval = options.interval || 5000;
    
    const monitor = async () => {
      const stats = await this.getBundleStats();
      
      console.clear();
      console.log('Bundle Monitor - ' + new Date().toLocaleTimeString());
      console.log('═'.repeat(50));
      console.log(`Total Size: ${stats.totalKB}KB (gzipped)`);
      console.log(`Chunks: ${stats.chunks}`);
      console.log(`Largest: ${stats.largest.name} (${stats.largest.size}KB)`);
      
      if (options.target && stats.totalKB > options.target) {
        console.log(`⚠️  Exceeds target of ${options.target}KB by ${stats.totalKB - options.target}KB`);
      }
    };

    // Initial run
    await monitor();
    
    // Set up monitoring interval
    if (!options.once) {
      setInterval(monitor, interval);
    }
  }

  async generateReport(options) {
    console.log('📄 Generating bundle report...');
    
    const [bundleAnalysis, depAnalysis, routeAnalysis] = await Promise.all([
      this.getBundleAnalysis(),
      this.analyzeDependencies({ format: 'json' }),
      this.analyzeRoutesSetup(),
    ]);

    const report = {
      timestamp: new Date().toISOString(),
      bundle: bundleAnalysis,
      dependencies: depAnalysis,
      routes: routeAnalysis,
      recommendations: this.generateComprehensiveRecommendations({
        bundle: bundleAnalysis,
        deps: depAnalysis,
        routes: routeAnalysis,
      }),
    };

    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
      console.log(`✅ Report saved to ${options.output}`);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    return report;
  }

  // Helper methods
  async getBundleAnalysis() {
    const distPath = path.resolve('dist/public/assets');
    const files = fs.readdirSync(distPath);
    
    const chunks = [];
    let totalSize = 0;

    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
      
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);
      const sizeKB = Math.round(stats.size / 1024);
      
      chunks.push({
        name: file,
        size: sizeKB,
        type: this.getChunkType(file),
      });
      
      totalSize += sizeKB;
    }

    return {
      totalSize,
      chunks: chunks.sort((a, b) => b.size - a.size),
      timestamp: new Date().toISOString(),
    };
  }

  async getBundleStats() {
    const analysis = await this.getBundleAnalysis();
    
    return {
      totalKB: analysis.totalSize,
      chunks: analysis.chunks.length,
      largest: analysis.chunks[0] || { name: 'unknown', size: 0 },
    };
  }

  getChunkType(filename) {
    if (filename.includes('vendor')) return 'vendor';
    if (filename.includes('index')) return 'main';
    if (filename.includes('chunk')) return 'async';
    return 'other';
  }

  async findUnusedDeps() {
    try {
      const result = await this.exec('npx depcheck --json');
      const data = JSON.parse(result);
      return data.dependencies || [];
    } catch {
      return [];
    }
  }

  async findHeavyDeps() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = Object.keys(packageJson.dependencies || {});
    
    const heavy = [];
    for (const dep of deps) {
      const size = await this.getDepSize(dep);
      if (size > 100) {
        heavy.push({ name: dep, sizeKB: size });
      }
    }
    
    return heavy.sort((a, b) => b.sizeKB - a.sizeKB);
  }

  async findDuplicateDeps() {
    try {
      const result = await this.exec('npm ls --json');
      const tree = JSON.parse(result);
      // Simplified duplicate detection
      return [];
    } catch {
      return [];
    }
  }

  async getDepSize(dep) {
    try {
      const depPath = path.resolve('node_modules', dep);
      const stats = await this.getDirSize(depPath);
      return Math.round(stats / 1024);
    } catch {
      return 0;
    }
  }

  async getDirSize(dir) {
    let size = 0;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory() && file !== 'node_modules') {
        size += await this.getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
    
    return size;
  }

  async analyzeRoutesSetup() {
    const pagesDir = path.resolve('client/src/pages');
    
    if (!fs.existsSync(pagesDir)) {
      return [];
    }

    const routes = [];
    const files = fs.readdirSync(pagesDir);
    
    for (const file of files) {
      if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
        const name = path.basename(file, path.extname(file));
        routes.push({
          name,
          file,
          path: `/${name.toLowerCase()}`,
          lazy: false, // Would check actual implementation
        });
      }
    }
    
    return routes;
  }

  generateDepRecommendations({ unused, heavy, duplicates }) {
    const recommendations = [];
    
    if (unused.length > 0) {
      recommendations.push({
        type: 'remove-unused',
        description: `Remove ${unused.length} unused dependencies`,
        command: `npm remove ${unused.join(' ')}`,
        impact: 'high',
      });
    }
    
    heavy.forEach(dep => {
      if (dep.name === 'moment') {
        recommendations.push({
          type: 'replace',
          description: 'Replace moment with date-fns',
          command: 'npm remove moment && npm install date-fns',
          impact: 'high',
        });
      }
    });
    
    return recommendations;
  }

  generateRouteOptimizations(routes) {
    return routes
      .filter(route => !route.lazy)
      .map(route => ({
        route: route.path,
        action: 'make-lazy',
        description: `Lazy load ${route.name}`,
      }));
  }

  async applyRouteOptimizations(optimizations) {
    // Implementation would apply the actual changes
    console.log('Applying optimizations:', optimizations);
  }

  generateComprehensiveRecommendations({ bundle, deps, routes }) {
    const recommendations = [];
    
    // Bundle recommendations
    if (bundle.totalSize > 400) {
      recommendations.push({
        priority: 'high',
        type: 'bundle',
        description: `Reduce bundle size from ${bundle.totalSize}KB to <400KB`,
      });
    }
    
    // Dependency recommendations
    recommendations.push(...this.generateDepRecommendations(deps));
    
    // Route recommendations
    const nonLazyRoutes = routes.filter(r => !r.lazy);
    if (nonLazyRoutes.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'routes',
        description: `Convert ${nonLazyRoutes.length} routes to lazy loading`,
      });
    }
    
    return recommendations;
  }

  printAnalysis(analysis) {
    console.log('\nBundle Analysis');
    console.log('═'.repeat(50));
    console.log(`Total Size: ${analysis.totalSize}KB`);
    console.log(`\nTop 5 Chunks:`);
    
    analysis.chunks.slice(0, 5).forEach(chunk => {
      console.log(`  ${chunk.name}: ${chunk.size}KB (${chunk.type})`);
    });
  }

  printDepAnalysis(analysis) {
    console.log('\nDependency Analysis');
    console.log('═'.repeat(50));
    
    if (analysis.unused.length > 0) {
      console.log('\n❌ Unused Dependencies:');
      analysis.unused.forEach(dep => console.log(`  - ${dep}`));
    }
    
    if (analysis.heavy.length > 0) {
      console.log('\n📦 Heavy Dependencies:');
      analysis.heavy.forEach(dep => console.log(`  - ${dep.name}: ${dep.sizeKB}KB`));
    }
    
    if (analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      analysis.recommendations.forEach(rec => {
        console.log(`  - ${rec.description}`);
        if (rec.command) {
          console.log(`    $ ${rec.command}`);
        }
      });
    }
  }

  /**
   * Execute a command safely without shell interpretation
   * Parses command string into binary and arguments
   */
  async exec(commandString) {
    // Parse command string into parts
    // For npm commands, split properly
    const parts = commandString.trim().split(/\s+/);
    const binary = parts[0];
    const args = parts.slice(1);

    try {
      const { stdout, stderr } = await execFileAsync(binary, args, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Command stderr:', stderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Command failed: ${binary} ${args.join(' ')}\n${error.message}`);
    }
  }

  /**
   * Execute npm script safely
   */
  async execNpm(script, ...args) {
    return execFileAsync('npm', ['run', script, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    }).then(({ stdout }) => stdout);
  }

  showHelp() {
    console.log(`
Bundle Analyzer Gateway - AI-powered bundle optimization

Usage: bundle-analyzer <command> [options]

Commands:
  analyze    Analyze current bundle composition
  optimize   Run bundle optimization agent
  deps       Analyze dependencies
  routes     Optimize route loading
  monitor    Monitor bundle size in real-time  
  report     Generate comprehensive report

Options:
  --target <kb>      Target bundle size in KB
  --strategy <type>  Optimization strategy (safe|balanced|aggressive)
  --format <type>    Output format (json|text)
  --output <file>    Save output to file
  --verbose, -v      Verbose output

Examples:
  bundle-analyzer analyze --format json
  bundle-analyzer optimize --target 400 --strategy balanced
  bundle-analyzer deps --verbose
  bundle-analyzer monitor --target 400
  bundle-analyzer report --output bundle-report.json
`);
  }
}

// Run the gateway
const gateway = new BundleAnalyzerGateway();
gateway.run(process.argv.slice(2));