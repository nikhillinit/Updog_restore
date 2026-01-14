const fs = require('fs');

const content = fs.readFileSync('lint-output-new.txt', 'utf8');
const lines = content.split('\n');

const fileCounts = {};
let currentFile = null;

for (const line of lines) {
  if (line.match(/^C:\\/)) {
    currentFile = line.trim();
  } else if (line.includes('@typescript-eslint/no-explicit-any') && line.includes('error')) {
    if (currentFile) {
      fileCounts[currentFile] = (fileCounts[currentFile] || 0) + 1;
    }
  }
}

const sorted = Object.entries(fileCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

console.log('Top 30 files with @typescript-eslint/no-explicit-any errors:\n');
sorted.forEach(([file, count]) => {
  const shortFile = file.replace('C:\\dev\\Updog_restore\\', '');
  console.log(`${count.toString().padStart(3)}  ${shortFile}`);
});

console.log(`\nTotal files with errors: ${Object.keys(fileCounts).length}`);
console.log(`Total errors: ${Object.values(fileCounts).reduce((a, b) => a + b, 0)}`);
