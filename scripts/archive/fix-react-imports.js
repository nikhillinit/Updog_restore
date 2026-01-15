#!/usr/bin/env node
/**
 * Fix missing React imports in test files
 * Addresses the known React test failures
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const testFilePatterns = [
  'client/**/*.test.tsx',
  'client/**/*.test.ts',
  'tests/**/*.test.tsx',
  'tests/**/*.spec.tsx',
];

let filesFixed = 0;

testFilePatterns.forEach((pattern) => {
  const files = glob.sync(pattern, { cwd: process.cwd() });

  files.forEach((file) => {
    const filePath = path.join(process.cwd(), file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if React import is missing
    if (!content.includes('import React') && !content.includes('import * as React')) {
      // Add React import at the beginning of the file
      const importStatement = "import React from 'react';\n";

      // If there are other imports, add React import before them
      if (content.includes('import ')) {
        const firstImportIndex = content.indexOf('import ');
        content =
          content.slice(0, firstImportIndex) + importStatement + content.slice(firstImportIndex);
      } else {
        // Otherwise add at the beginning
        content = importStatement + content;
      }

      fs.writeFileSync(filePath, content);
      filesFixed++;
      console.log(`✓ Fixed: ${file}`);
    }
  });
});

console.log(`\n✅ Fixed ${filesFixed} files with missing React imports`);
