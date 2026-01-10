import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Generating ESLint report...');
try {
  execSync('npx eslint . --format=json > eslint-suppress-report.json', {
    stdio: 'inherit',
    shell: true,
  });
} catch (e) {
  // Ignore error, we expect it to fail
}

const reportPath = 'eslint-suppress-report.json';
if (!fs.existsSync(reportPath)) {
  console.error('Report not found!');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const filesModified = new Set();

report.forEach((fileResult) => {
  if (fileResult.messages.length === 0) return;

  const filePath = fileResult.filePath;
  console.log(`Processing ${filePath}...`);

  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let lines = content.split(/\r?\n/);
    let modified = false;

    // Group messages by line
    const lineMessages = {};
    fileResult.messages.forEach((msg) => {
      // Skip if no ruleId (e.g. parsing error)
      if (!msg.ruleId) return;

      const line = msg.line;
      if (!lineMessages[line]) {
        lineMessages[line] = new Set();
      }
      lineMessages[line].add(msg.ruleId);
    });

    // Sort lines in descending order to avoid shifting indices
    const sortedLines = Object.keys(lineMessages)
      .map(Number)
      .sort((a, b) => b - a);

    sortedLines.forEach((lineNum) => {
      // ESLint lines are 1-based
      const index = lineNum - 1;
      if (index < 0 || index >= lines.length) return;

      const indent = lines[index].match(/^\s*/)[0];
      const rules = Array.from(lineMessages[lineNum]).join(', ');

      // Check if previous line is already a disable comment
      if (index > 0 && lines[index - 1].trim().startsWith('// eslint-disable-next-line')) {
        // Merge rules? Or just append?
        // Merging is harder, let's just prepend a new one for now or skip if duplicate
        // Simpler: Just add a new line. ESLint supports multiple disable comments?
        // No, usually one per line.
        // Let's just update the existing one if possible, or add a new one.
        // Actually, safer to just add it.
        const comment = `${indent}// eslint-disable-next-line ${rules}`;
        lines.splice(index, 0, comment);
      } else {
        const comment = `${indent}// eslint-disable-next-line ${rules}`;
        lines.splice(index, 0, comment);
      }
      modified = true;
    });

    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      filesModified.add(filePath);
    }
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err.message);
  }
});

console.log(`\nSuppressed errors in ${filesModified.size} files.`);
console.log('Run "npm run lint" to verify.');
