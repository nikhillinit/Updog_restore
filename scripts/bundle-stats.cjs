#!/usr/bin/env node
/**
 * Generate bundle statistics for the current build
 * Outputs JSON with file sizes and categories
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const gzipSize = (content) => {
  return zlib.gzipSync(content, { level: 9 }).length;
};

const generateStats = (dir = 'dist') => {
  const stats = {
    vendor: 0,
    main: 0,
    runtime: 0,
    styles: 0,
    total: 0,
    files: {},
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown'
  };

  const assetsDir = path.join(dir, 'public', 'assets');
  
  // Also check alternative paths
  const alternativePaths = [
    path.join(dir, 'assets'),
    path.join(dir, 'client', 'assets'),
    path.join('dist', 'assets')
  ];
  
  let targetDir = assetsDir;
  if (!fs.existsSync(assetsDir)) {
    for (const altPath of alternativePaths) {
      if (fs.existsSync(altPath)) {
        targetDir = altPath;
        break;
      }
    }
  }
  
  if (!fs.existsSync(targetDir)) {
    process.stderr.write(`Warning: Assets directory not found, tried: ${assetsDir} and alternatives\n`);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const files = fs.readdirSync(targetDir)
    .filter(file => file.endsWith('.js') || file.endsWith('.css'));
  
  files.forEach(file => {
    const filePath = path.join(targetDir, file);
    const content = fs.readFileSync(filePath);
    const size = gzipSize(content);
    
    stats.files[file] = size;
    stats.total += size;
    
    // Categorize files
    if (file.includes('vendor') || file.includes('node_modules')) {
      stats.vendor += size;
    } else if (file.includes('index') || file.includes('main') || file.includes('app')) {
      stats.main += size;
    } else if (file.includes('runtime') || file.includes('polyfill')) {
      stats.runtime += size;
    } else if (file.endsWith('.css')) {
      stats.styles += size;
    }
  });

  console.log(JSON.stringify(stats, null, 2));
};

// Run if executed directly
if (require.main === module) {
  generateStats();
}