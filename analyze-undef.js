import fs from 'fs';
const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));

console.log('Files with no-undef errors:');
report.forEach((file) => {
  const undefs = file.messages.filter((m) => m.ruleId === 'no-undef');
  if (undefs.length > 0) {
    console.log(`
${file.filePath}`);
    undefs.forEach((m) => console.log(`  Line ${m.line}: ${m.message}`));
  }
});
