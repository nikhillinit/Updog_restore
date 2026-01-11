#!/usr/bin/env node
/**
 * Automated TS4111 Fixer
 *
 * Converts dot notation to bracket notation for index signature properties.
 * Parses TypeScript compiler output to identify exact locations needing fixes.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Analyzing TS4111 errors...\n');

// Run TypeScript compiler to get all TS4111 errors
let tscOutput;
try {
  tscOutput = execSync('npx tsc --noEmit 2>&1', {
    encoding: 'utf-8',
    cwd: __dirname + '/..',
    maxBuffer: 10 * 1024 * 1024,
  }).toString();
} catch (error) {
  // tsc exits with error when there are type errors - that's expected
  tscOutput = error.output.join('');
}

// Parse TS4111 errors
const ts4111Regex = /^(.+?)\((\d+),(\d+)\): error TS4111: Property '(.+?)' comes from an index signature, so it must be accessed with \['(.+?)'\]\.$/gm;

const errors = [];
let match;
while ((match = ts4111Regex.exec(tscOutput)) !== null) {
  errors.push({
    file: match[1],
    line: parseInt(match[2]),
    col: parseInt(match[3]),
    property: match[4],
  });
}

console.log(`Found ${errors.length} TS4111 errors across ${new Set(errors.map(e => e.file)).size} files\n`);

if (errors.length === 0) {
  console.log('✅ No TS4111 errors found!');
  process.exit(0);
}

// Group errors by file
const fileErrors = {};
for (const error of errors) {
  if (!fileErrors[error.file]) {
    fileErrors[error.file] = [];
  }
  fileErrors[error.file].push(error);
}

// Process each file
let totalFixed = 0;
for (const [file, fileErrs] of Object.entries(fileErrors)) {
  const filePath = path.resolve(__dirname, '..', file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    continue;
  }

  console.log(`📝 Fixing ${file} (${fileErrs.length} errors)...`);

  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Sort errors by line DESC, col DESC to fix from end to start (preserves positions)
  fileErrs.sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line;
    return b.col - a.col;
  });

  for (const error of fileErrs) {
    const lineIndex = error.line - 1;
    const line = lines[lineIndex];

    if (!line) {
      console.log(`   ⚠️  Line ${error.line} not found, skipping`);
      continue;
    }

    // Find the property access at the specified column
    // TS reports column as 1-indexed pointing to the property name
    // We need to look backward to find the dot
    const col = error.col - 1;

    // Check if property name matches at the column position
    const expectedProperty = line.substring(col, col + error.property.length);
    if (expectedProperty !== error.property) {
      console.log(`   ⚠️  Property name mismatch at line ${error.line}, col ${error.col}`);
      console.log(`      Expected: '${error.property}', Found: '${expectedProperty}'`);
      console.log(`      Line: ${line}`);
      continue;
    }

    // Look backward for the dot or optional chaining operator
    const beforeProperty = line.substring(0, col);
    let dotStart = -1;
    let isOptionalChaining = false;

    // Check for ?. (2 chars) or . (1 char) immediately before property
    if (beforeProperty.endsWith('?.')) {
      dotStart = col - 2;
      isOptionalChaining = true;
    } else if (beforeProperty.endsWith('.')) {
      dotStart = col - 1;
      isOptionalChaining = false;
    }

    if (dotStart === -1) {
      console.log(`   ⚠️  No dot found before property '${error.property}' at line ${error.line}, col ${error.col}`);
      console.log(`      Line: ${line}`);
      continue;
    }

    // Build the replacement
    const beforeDot = line.substring(0, dotStart);
    const afterProperty = line.substring(col + error.property.length);
    const replacement = isOptionalChaining ? `?.['${error.property}']` : `['${error.property}']`;

    lines[lineIndex] = beforeDot + replacement + afterProperty;
    totalFixed++;
  }

  // Write back the fixed content
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`   ✅ Fixed ${fileErrs.length} errors\n`);
}

console.log(`\n✅ Total fixed: ${totalFixed} TS4111 errors\n`);
console.log('🔄 Running TypeScript compiler to verify...\n');

try {
  execSync('npx tsc --noEmit 2>&1 | grep "error TS4111" | wc -l', {
    encoding: 'utf-8',
    cwd: __dirname + '/..',
    stdio: 'inherit',
  });
} catch (e) {
  // Expected - tsc will exit with error if there are still errors
}

console.log('\n✨ Done!\n');
