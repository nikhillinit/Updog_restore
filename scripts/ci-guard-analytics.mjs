#!/usr/bin/env node

/**
 * CI Guard: Prevents accidental analytics feature enablement on main branch
 * Requires explicit SHIP_ANALYTICS=1 to enable analytics in production
 */

const analytics = process.env.VITE_FEATURE_ANALYTICS === 'true';
const waterfall = process.env.VITE_FEATURE_WATERFALL === 'true';
const ship = process.env.SHIP_ANALYTICS === '1';
const branch = process.env.GITHUB_REF || '';

// Check if we're on main branch
const isMainBranch = branch.endsWith('/main') || branch === 'main';

if (isMainBranch && analytics && !ship) {
  console.error('❌ CI Guard: Refusing to build main with VITE_FEATURE_ANALYTICS=true');
  console.error('   To enable analytics in production, set SHIP_ANALYTICS=1');
  process.exit(1);
}

if (isMainBranch && waterfall && !analytics) {
  console.error('❌ CI Guard: VITE_FEATURE_WATERFALL requires VITE_FEATURE_ANALYTICS');
  process.exit(1);
}

// Success messages
if (isMainBranch) {
  if (analytics && ship) {
    console.log('✅ CI Guard: Analytics explicitly enabled with SHIP_ANALYTICS=1');
  } else if (!analytics) {
    console.log('✅ CI Guard: Analytics safely disabled on main branch');
  }
} else {
  console.log('✅ CI Guard: Non-main branch, no restrictions');
}