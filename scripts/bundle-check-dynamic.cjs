#!/usr/bin/env node
/**
 * Dynamic bundle size guard with percentage-based tolerance
 * Compares current bundle against baseline with configurable tolerance
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Parse CLI arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value;
  return acc;
}, {});

const currentStatsPath = args.current || 'bundle-stats.json';
const baselineStats = args.baseline ? JSON.parse(args.baseline) : {};
const tolerance = parseFloat(args.tolerance || '0.05'); // 5% default
const hasApproval = args['has-approval'] === 'true';

// Helper to calculate gzipped size
const gzipSize = (content) => {
  if (typeof content === 'string') {
    return zlib.gzipSync(Buffer.from(content), { level: 9 }).length;
  }
  return zlib.gzipSync(content, { level: 9 }).length;
};

// Analyze bundle sizes by category
const analyzeBundle = (dir = 'dist') => {
  const stats = {
    vendor: 0,
    main: 0,
    runtime: 0,
    styles: 0,
    total: 0,
    files: {},
    timestamp: new Date().toISOString()
  };

  const assetsDir = path.join(dir, 'public', 'assets');
  if (!fs.existsSync(assetsDir)) {
    console.warn(`Warning: Assets directory not found at ${assetsDir}`);
    return stats;
  }

  const files = fs.readdirSync(assetsDir);
  
  files.forEach(file => {
    const filePath = path.join(assetsDir, file);
    const content = fs.readFileSync(filePath);
    const size = gzipSize(content);
    
    stats.files[file] = size;
    stats.total += size;
    
    // Categorize files
    if (file.includes('vendor')) {
      stats.vendor += size;
    } else if (file.includes('index') || file.includes('main')) {
      stats.main += size;
    } else if (file.includes('runtime')) {
      stats.runtime += size;
    } else if (file.endsWith('.css')) {
      stats.styles += size;
    }
  });

  return stats;
};

// Compare current vs baseline with tolerance
const compareWithBaseline = (current, baseline, tolerance) => {
  const violations = [];
  const warnings = [];
  
  // Critical paths to check
  const criticalPaths = ['vendor', 'main', 'total'];
  
  criticalPaths.forEach(path => {
    if (baseline[path]) {
      const growth = (current[path] - baseline[path]) / baseline[path];
      const growthPercent = (growth * 100).toFixed(2);
      
      if (growth > tolerance) {
        violations.push({
          path,
          baseline: baseline[path],
          current: current[path],
          growth: growthPercent
        });
      } else if (growth > tolerance * 0.5) {
        warnings.push({
          path,
          baseline: baseline[path],
          current: current[path],
          growth: growthPercent
        });
      }
    }
  });

  return { violations, warnings };
};

// Format size for display
const formatSize = (bytes) => {
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
};

// Main execution
const main = () => {
  console.log('🔍 Dynamic Bundle Size Check');
  console.log('================================');
  
  // Analyze current bundle
  const currentStats = analyzeBundle();
  
  // Save current stats for future baselines
  if (currentStatsPath) {
    fs.writeFileSync(currentStatsPath, JSON.stringify(currentStats, null, 2));
  }
  
  // Display current stats
  console.log('\n📦 Current Bundle:');
  console.log(`  Vendor:  ${formatSize(currentStats.vendor)}`);
  console.log(`  Main:    ${formatSize(currentStats.main)}`);
  console.log(`  Runtime: ${formatSize(currentStats.runtime)}`);
  console.log(`  Styles:  ${formatSize(currentStats.styles)}`);
  console.log(`  Total:   ${formatSize(currentStats.total)}`);
  
  // Compare with baseline if available
  if (baselineStats.total) {
    console.log('\n📊 Baseline Comparison:');
    console.log(`  Tolerance: ${(tolerance * 100).toFixed(0)}%`);
    console.log(`  Has Approval: ${hasApproval}`);
    
    const { violations, warnings } = compareWithBaseline(currentStats, baselineStats, tolerance);
    
    // Display warnings
    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings (approaching limit):');
      warnings.forEach(w => {
        console.log(`  ${w.path}: +${w.growth}% (${formatSize(w.baseline)} → ${formatSize(w.current)})`);
      });
    }
    
    // Display violations
    if (violations.length > 0) {
      console.log('\n❌ Violations (exceeds tolerance):');
      violations.forEach(v => {
        console.log(`  ${v.path}: +${v.growth}% (${formatSize(v.baseline)} → ${formatSize(v.current)})`);
      });
      
      if (!hasApproval) {
        console.error('\n❌ Bundle size increased beyond tolerance without approval!');
        console.error('   Add label "approved:perf-budget-change" to proceed.');
        process.exit(1);
      } else {
        console.log('\n✅ Bundle size increase approved via label');
      }
    } else {
      console.log('\n✅ Bundle size within tolerance');
    }
  } else {
    console.log('\n⚠️  No baseline available - using static fallback check');
    
    // Fallback to static limit
    const maxKB = 350;
    const totalKB = currentStats.total / 1024;
    
    if (totalKB > maxKB) {
      if (!hasApproval) {
        console.error(`\n❌ Bundle size ${formatSize(currentStats.total)} exceeds ${maxKB} KB limit`);
        console.error('   Add label "approved:perf-budget-change" to proceed.');
        process.exit(1);
      } else {
        console.log(`\n⚠️  Bundle size ${formatSize(currentStats.total)} exceeds ${maxKB} KB limit (approved)`);
      }
    } else {
      console.log(`\n✅ Bundle size ${formatSize(currentStats.total)} within ${maxKB} KB limit`);
    }
  }
  
  console.log('\n================================');
  console.log('✅ Bundle check complete');
};

// Run if executed directly
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('❌ Bundle check failed:', error.message);
    process.exit(1);
  }
}

module.exports = { analyzeBundle, compareWithBaseline };