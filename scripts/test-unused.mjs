#!/usr/bin/env node

console.log('Script starting...');

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('Project root:', projectRoot);

try {
  console.log('Finding TypeScript files...');
  const output = execSync('git ls-files "*.ts" "*.tsx"', { 
    cwd: projectRoot,
    encoding: 'utf8' 
  });
  
  const files = output.split('\n').filter(Boolean);
  console.log(`Found ${files.length} TypeScript files`);
  
  // Try to run ESLint on first file
  if (files.length > 0) {
    const firstFile = files[0];
    console.log(`Testing ESLint on: ${firstFile}`);
    
    try {
      const eslintOutput = execSync(`npx eslint "${firstFile}" --format json`, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log('ESLint output received');
    } catch (error) {
      console.log('ESLint returned errors (expected)');
      if (error.stdout) {
        const results = JSON.parse(error.stdout);
        console.log(`Found ${results[0]?.messages?.length || 0} issues in first file`);
      }
    }
  }
} catch (error) {
  console.error('Error:', error.message);
}