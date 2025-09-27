#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extracts bundle size from Vite build output and writes to dist/.app-size-kb
 * Run this immediately after npm run build
 */

function extractBundleSize() {
  const distPath = path.join(process.cwd(), 'dist');
  const publicPath = path.join(distPath, 'public');
  const assetsPath = path.join(publicPath, 'assets');
  
  let totalSize = 0;
  let fileCount = 0;
  const fileSizes = [];
  
  // Method 1: Calculate from actual files
  if (fs.existsSync(assetsPath)) {
    console.log('📊 Analyzing bundle size from built assets...');
    
    const files = fs.readdirSync(assetsPath);
    
    files.forEach(file => {
      const filePath = path.join(assetsPath, file);
      const stats = fs.statSync(filePath);
      
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const sizeKB = stats.size / 1024;
        totalSize += sizeKB;
        fileCount++;
        
        fileSizes.push({
          name: file,
          sizeKB: Math.round(sizeKB * 10) / 10
        });
        
        // Log large files
        if (sizeKB > 100) {
          console.log(`  📦 ${file}: ${Math.round(sizeKB)}KB`);
        }
      }
    });
    
    writeSizeFile(Math.round(totalSize), fileSizes);
  } else if (fs.existsSync(path.join(distPath, 'assets'))) {
    // Fallback: Check dist/assets directly
    console.log('📊 Analyzing bundle size from dist/assets...');
    
    const assetsAltPath = path.join(distPath, 'assets');
    const files = fs.readdirSync(assetsAltPath);
    
    files.forEach(file => {
      const filePath = path.join(assetsAltPath, file);
      const stats = fs.statSync(filePath);
      
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const sizeKB = stats.size / 1024;
        totalSize += sizeKB;
        fileCount++;
        
        fileSizes.push({
          name: file,
          sizeKB: Math.round(sizeKB * 10) / 10
        });
      }
    });
    
    writeSizeFile(Math.round(totalSize), fileSizes);
  } else {
    // Method 2: Try to parse from stdin or build.log
    const buildLogPath = path.join(process.cwd(), 'build.log');
    
    if (fs.existsSync(buildLogPath)) {
      console.log('📊 Extracting bundle size from build.log...');
      
      const buildOutput = fs.readFileSync(buildLogPath, 'utf8');
      const lines = buildOutput.split('\n');
      
      // Look for Vite output pattern
      lines.forEach(line => {
        // Match patterns like "vendor-charts-CN6t8XcM.js  371.23 kB"
        const match = line.match(/(\S+\.(js|css))\s+(\d+\.?\d*)\s*kB/);
        if (match) {
          const fileName = match[1];
          const sizeKB = parseFloat(match[3]);
          
          if (fileName.includes('vendor') || fileName.includes('index') || fileName.includes('app')) {
            totalSize += sizeKB;
            fileCount++;
            
            fileSizes.push({
              name: fileName,
              sizeKB: Math.round(sizeKB * 10) / 10
            });
            
            if (sizeKB > 100) {
              console.log(`  📦 ${fileName}: ${Math.round(sizeKB)}KB`);
            }
          }
        }
      });
      
      if (totalSize > 0) {
        writeSizeFile(Math.round(totalSize), fileSizes);
      } else {
        console.error('❌ Could not extract bundle size from build.log');
        console.log('Make sure to run: npm run build 2>&1 | tee build.log');
        process.exit(1);
      }
    } else {
      console.error('❌ Build output not found. Run npm run build first.');
      console.log('For best results, run: npm run build 2>&1 | tee build.log');
      process.exit(1);
    }
  }
}

function writeSizeFile(sizeKB, fileSizes = []) {
  const distPath = path.join(process.cwd(), 'dist');
  
  // Ensure dist directory exists
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }
  
  // Write simple size file for CI
  fs.writeFileSync(path.join(distPath, '.app-size-kb'), sizeKB.toString());
  
  // Write detailed report
  const report = {
    timestamp: new Date().toISOString(),
    totalKB: sizeKB,
    budgetKB: 400,
    percentUsed: Math.round((sizeKB / 400) * 100),
    fileCount: fileSizes.length,
    files: fileSizes.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 10), // Top 10 largest
    status: sizeKB > 400 ? 'over-budget' : sizeKB > 380 ? 'warning' : 'ok'
  };
  
  fs.writeFileSync(
    path.join(distPath, '.bundle-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  // Console output
  console.log('');
  console.log('📦 Bundle Size Report');
  console.log('====================');
  console.log(`Total: ${sizeKB}KB (${report.percentUsed}% of 400KB budget)`);
  console.log(`Files: ${report.fileCount} bundles`);
  
  // Status indicator
  if (sizeKB > 400) {
    console.error('❌ FAILED: Bundle exceeds 400KB budget!');
    process.exit(1);
  } else if (sizeKB > 380) {
    console.warn('⚠️  WARNING: Bundle approaching limit (>95% of budget)');
  } else {
    console.log('✅ Bundle size within budget');
  }
  
  console.log('');
  console.log('Files written:');
  console.log(`  - dist/.app-size-kb (${sizeKB})`);
  console.log(`  - dist/.bundle-report.json (detailed report)`);
}

// Run extraction
try {
  extractBundleSize();
} catch (error) {
  console.error('❌ Error extracting bundle size:', error.message);
  process.exit(1);
}