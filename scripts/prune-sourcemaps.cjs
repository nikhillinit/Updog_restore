/**
 * Sourcemap Pruning Script
 * Removes .map files from the dist directory after build
 * This allows local debugging with sourcemaps while preventing them from being uploaded to Vercel
 */

const fs = require('fs');
const path = require('path');

function removeMaps(dir) {
  let count = 0;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively process subdirectories
        count += removeMaps(fullPath);
      } else if (entry.isFile() && fullPath.endsWith('.map')) {
        // Remove sourcemap files
        fs.unlinkSync(fullPath);
        console.log(`Removed: ${path.relative(process.cwd(), fullPath)}`);
        count++;
      }
    }
  } catch (error) {
    console.error(`Error processing ${dir}:`, error.message);
  }
  
  return count;
}

// Main execution
const distPath = path.join(process.cwd(), 'dist');

if (!fs.existsSync(distPath)) {
  console.log('No dist directory found. Skipping sourcemap removal.');
  process.exit(0);
}

console.log('Removing sourcemap files from dist directory...');
const removedCount = removeMaps(distPath);

if (removedCount > 0) {
  console.log(`✅ Successfully removed ${removedCount} sourcemap file(s)`);
} else {
  console.log('No sourcemap files found to remove');
}