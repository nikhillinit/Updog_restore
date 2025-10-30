#!/usr/bin/env node
/* Extract seed cases from markdown and update WIP files */
const fs = require('fs');
const path = require('path');

const seedFile = 'Seed Cases for CA-007 - CA-020.md';
const wipDir = path.join(__dirname, 'wip-cases');

if (!fs.existsSync(seedFile)) {
  console.error('❌ Seed cases file not found:', seedFile);
  process.exit(1);
}

const content = fs.readFileSync(seedFile, 'utf8');

// Find the start of JSON after "Option A" marker
const optionAIndex = content.indexOf('```json');
const endMarkerIndex = content.indexOf('```', optionAIndex + 7);

if (optionAIndex === -1 || endMarkerIndex === -1) {
  console.error('❌ JSON section not found in seed file');
  process.exit(1);
}

// Extract JSON content between markers
const jsonContent = content.substring(optionAIndex + 7, endMarkerIndex).trim();

// Parse as array of objects
let cases;
try {
  // Wrap in array brackets if not already
  const arrayContent = jsonContent.startsWith('[') ? jsonContent : `[${jsonContent}]`;
  cases = JSON.parse(arrayContent);
} catch (e) {
  console.error('❌ Failed to parse JSON:', e.message);
  process.exit(1);
}

const caseMatches = cases;

if (!Array.isArray(caseMatches)) {
  console.error('❌ Could not parse case objects as array');
  process.exit(1);
}

let updated = 0;
for (const caseObj of caseMatches) {
  try {
    const id = caseObj.id;
    const wipFile = path.join(wipDir, `${id}.json`);

    fs.writeFileSync(wipFile, JSON.stringify(caseObj, null, 2));
    console.log(`✅ Updated ${id}`);
    updated++;
  } catch (e) {
    console.error(`❌ Failed to update case:`, e.message);
  }
}

console.log(`\n✅ Updated ${updated} WIP cases`);
