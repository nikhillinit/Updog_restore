import fs from 'node:fs';

const file = process.argv[2] || './docs/waterfall.truth-cases.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

let carryTagsAdded = 0;

for (const tc of data) {
  // Check if scenario has a carry tier with non-zero GP distribution
  const hasCarryDistribution = tc.expected.breakdown.some(
    b => b.tier === 'carry' && parseFloat(b.gpAmount || 0) > 0
  );

  if (hasCarryDistribution) {
    // Ensure tags array exists
    if (!Array.isArray(tc.tags)) {
      tc.tags = [];
    }

    // Add 'carry' tag if not present
    if (!tc.tags.includes('carry')) {
      tc.tags.push('carry');
      carryTagsAdded++;
      console.log(`[TAG] Added 'carry' to scenario: ${tc.scenario}`);
    }
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`\n--- Complete ---`);
console.log(`Carry tags added: ${carryTagsAdded}`);
