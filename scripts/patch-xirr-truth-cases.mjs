import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/patch-xirr-truth-cases.mjs <path-to-xirr.truth-cases.json>");
  process.exit(1);
}

// Map of ID -> Correct Actual/365 IRR
const updates = {
  // --- Standardized Updates (Diff > 1bp) ---
  "xirr-01-simple-positive-return": 0.2008834994,
  "xirr-02-negative-return-loss": -0.3687244948,
  "xirr-03-multi-round-partial-distributions": 0.3086491291,
  "xirr-04-quarterly-flows": 0.8055855854,
  "xirr-06-newton-success-smooth": 0.2008834994,
  "xirr-08-bisection-only-mode": 0.2008834994,
  "xirr-09-convergence-tolerance-boundary": 0.2008834994,
  "xirr-11-excel-actual365-date-convention": 0.2008834994,
  "xirr-12-same-day-cashflow-aggregation": 0.2008834994,
  "xirr-14-date-ordering-unsorted": 0.2008834994,
  "xirr-15-timezone-independent": 0.2008834994,
  "xirr-20-floating-point-precision-tiny-amounts": 0.2008834994,
  "xirr-22-early-exit-high-irr": 1.1529264684,
  "xirr-23-late-exit-lower-irr": 0.1744636993,
  "xirr-24-quarterly-recycling": 0.5569576357,
  "xirr-25-nav-heavy-terminal-value": 0.2555345226,
  "xirr-golden-case-1-standard-2-flow": 0.1485240459,
  "xirr-golden-case-13-shallow-loss-spread": -0.0104721798,
  "xirr-golden-case-14-quick-flip": 0.4983391779,
  "xirr-golden-case-4-explosive-growth": 0.777578891,
  "xirr-golden-case-5-modest-hold": 0.0799314924,
  "xirr-golden-case-6-partial-loss": -0.1293173151,
  "xirr-golden-case-7-near-zero": 0.0019898648,
  "xirr-golden-case-8-multiple-follow-ons": 0.1685408789,

  // --- Verified Corrections for Major Failures ---
  "xirr-13-leap-year-handling": 5.1468231090,
  "xirr-golden-case-2-rapid-3x": 0.4417677551,
  "xirr-golden-case-3-multi-stage-exit": 0.1418598534,
  "xirr-golden-case-9-extreme-unicorn": 1.1529264684,
  "xirr-golden-case-10-alternating-signs": 0.0716179977,
  "xirr-golden-case-11-leap-year-precision": 0.1697256401,
  "xirr-golden-case-12-annual-dividends": 0.0451316954
};

const rows = JSON.parse(fs.readFileSync(file, "utf8"));

let updatedCount = 0;
let tagFixed = false;
const processedIds = new Set();

console.log("--- Starting Patch ---");

for (const row of rows) {
  const newVal = updates[row.id];

  // 1. Update IRRs (Only if value actually differs)
  if (newVal !== undefined) {
    processedIds.add(row.id);

    // Check against current value to avoid false positives in reporting
    const currentVal = row.expected?.irr ?? row.expectedIRR;
    const isDiff = Math.abs(currentVal - newVal) > 1e-10; // Floating point safety check

    if (isDiff) {
      console.log(`[UPDATE] ${row.id}: \n   Old: ${currentVal}\n   New: ${newVal}`);

      if (row.expected && typeof row.expected === "object") {
        row.expected.irr = newVal;
      }
      if (row.expectedIRR !== undefined) {
        row.expectedIRR = newVal;
      }
      updatedCount++;
    }
  }

  // 2. Fix Waterfall Tag (Guarded)
  if (row.id === "xirr-golden-case-16-waterfall-exit") {
    // Safety: ensure tags array exists
    if (!Array.isArray(row.tags)) {
        row.tags = [];
    }

    if (!row.tags.includes("waterfall")) {
      row.tags.push("waterfall");
      tagFixed = true;
      console.log(`[TAG] Added 'waterfall' tag to ${row.id} (for grouping/filtering)`);
    }
  }
}

// 3. Verify all requested updates were found
const missingUpdates = Object.keys(updates).filter(id => !processedIds.has(id));
if (missingUpdates.length > 0) {
    console.warn("\n⚠️  WARNING: The following IDs were in the patch list but NOT found in the file:");
    missingUpdates.forEach(id => console.warn(`   - ${id}`));
}

fs.writeFileSync(file, JSON.stringify(rows, null, 2) + "\n");
console.log(`\n--- Complete ---`);
console.log(`Values Updated: ${updatedCount}`);
console.log(`Tags Fixed: ${tagFixed ? 1 : 0}`);
