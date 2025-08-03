#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Smart ESLint migration helper that batches fixes by dependency depth
 * to minimize cascading changes in PRs
 */

const MAX_FILES_PER_BATCH = 80; // GitHub diff viewer limit

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxFiles = args.find(arg => arg.startsWith('--max-files='))?.split('=')[1] || MAX_FILES_PER_BATCH;
  const branchName = args.find(arg => arg.startsWith('--branch='))?.split('=')[1];

  console.log('🔍 Analyzing dependency graph...');
  
  // Generate dependency graph
  try {
    execSync('npx madge --json client/src > deps.json', { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to generate dependency graph:', error.message);
    process.exit(1);
  }

  // Read dependency graph
  const deps = JSON.parse(fs.readFileSync('deps.json', 'utf8'));
  
  // Calculate dependency depths
  const depthMap = calculateDepths(deps);
  
  // Group files by depth
  const batches = groupByDepth(depthMap);
  
  console.log(`📊 Found ${Object.keys(depthMap).length} files across ${batches.length} depth levels`);
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - Preview only\n');
    console.log(`Would process ${batches.length} batches with max ${maxFiles} files each:`);
    
    for (let i = 0; i < Math.min(batches.length, 3); i++) {
      const batch = batches[i];
      const files = batch.files.slice(0, parseInt(maxFiles));
      console.log(`\nBatch ${i + 1} (depth ${batch.depth}): ${files.length} files`);
      console.log(`Preview: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
    }
    
    if (branchName) {
      console.log(`\nWould create branch: ${branchName}`);
    }
    
    console.log('\n✨ Run without --dry-run to execute');
    return;
  }
  
  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const depth = batch.depth;
    const files = batch.files;
    
    console.log(`\n🔧 Processing depth ${depth} (${files.length} files)...`);
    
    // Split large batches to respect GitHub's diff limit
    const subBatches = chunkArray(files, MAX_FILES_PER_BATCH);
    
    for (let j = 0; j < subBatches.length; j++) {
      const subBatch = subBatches[j];
      const batchName = subBatches.length > 1 ? `${i + 1}-${j + 1}` : `${i + 1}`;
      
      console.log(`  📝 Sub-batch ${batchName}: ${subBatch.length} files`);
      
      // Run ESLint fix on the batch
      try {
        const fileList = subBatch.join(' ');
        execSync(`npx eslint --fix ${fileList}`, { stdio: 'inherit' });
        
        // Check if there are any changes
        const hasChanges = execSync('git diff --name-only', { encoding: 'utf8' }).trim();
        
        if (hasChanges) {
          console.log(`  ✅ Fixed ${hasChanges.split('\n').length} files`);
          
          // Option to create PR for this batch
          console.log(`  💡 Ready to commit batch ${batchName}. Run:`);
          console.log(`     git add . && git commit -m "fix: async ESLint fixes - batch ${batchName} (depth ${depth})"`);
          console.log(`     git push origin async-migration-${batchName}`);
          console.log('');
        } else {
          console.log(`  ✨ No changes needed for batch ${batchName}`);
        }
        
      } catch (error) {
        console.error(`  ❌ ESLint failed for batch ${batchName}:`, error.message);
      }
    }
  }
  
  // Cleanup
  fs.unlinkSync('deps.json');
  
  console.log('\n🎉 Smart ESLint migration complete!');
  console.log('💡 Pro tip: Create separate PRs for each batch to make reviews manageable.');
}

/**
 * Calculate dependency depth for each file
 */
function calculateDepths(deps) {
  const depthMap = {};
  const visited = new Set();
  
  function calculateDepth(file) {
    if (visited.has(file)) {
      return depthMap[file] || 0; // Circular dependency guard
    }
    
    visited.add(file);
    
    const dependencies = deps[file] || [];
    if (dependencies.length === 0) {
      depthMap[file] = 0; // Leaf node
    } else {
      const maxDepth = Math.max(...dependencies.map(dep => calculateDepth(dep)));
      depthMap[file] = maxDepth + 1;
    }
    
    return depthMap[file];
  }
  
  // Calculate depths for all files
  Object.keys(deps).forEach(file => calculateDepth(file));
  
  return depthMap;
}

/**
 * Group files by dependency depth
 */
function groupByDepth(depthMap) {
  const groups = {};
  
  Object.entries(depthMap).forEach(([file, depth]) => {
    if (!groups[depth]) {
      groups[depth] = [];
    }
    groups[depth].push(file);
  });
  
  // Convert to sorted array of batches (process leaves first)
  return Object.entries(groups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([depth, files]) => ({
      depth: parseInt(depth),
      files: files.filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
    }))
    .filter(batch => batch.files.length > 0);
}

/**
 * Split array into chunks of specified size
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Smart fix failed:', error);
    process.exit(1);
  });
}

module.exports = { calculateDepths, groupByDepth, chunkArray };
