import fs from 'fs';
const report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'));

let totalErrors = 0;
let totalWarnings = 0;
const ruleCounts = {};
const fileCounts = {};

report.forEach((file) => {
  const errorCount = file.errorCount;
  const warningCount = file.warningCount;

  if (errorCount + warningCount > 0) {
    totalErrors += errorCount;
    totalWarnings += warningCount;
    fileCounts[file.filePath] = errorCount + warningCount;

    file.messages.forEach((msg) => {
      if (msg.ruleId) {
        ruleCounts[msg.ruleId] = (ruleCounts[msg.ruleId] || 0) + 1;
      }
    });
  }
});

console.log(`Total Errors: ${totalErrors}`);
console.log(`Total Warnings: ${totalWarnings}`);
console.log('\nTop 10 Rules:');
Object.entries(ruleCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([rule, count]) => console.log(`${rule}: ${count}`));

console.log('\nTop 5 Files:');
Object.entries(fileCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([file, count]) => console.log(`${file}: ${count}`));
