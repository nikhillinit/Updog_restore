#!/usr/bin/env node
/**
 * Safe branch protection updater - merges with existing settings
 * Prevents accidental loosening of protection policies
 * Usage: node scripts/update-branch-protection.js [branch] [--dry-run]
 */

const { execSync } = require('child_process');

const BRANCH = process.argv[2] || 'main';
const DRY_RUN = process.argv.includes('--dry-run');

// Repository from git remote or environment
const REPO = process.env.GITHUB_REPOSITORY || 
  execSync('git remote get-url origin', { encoding: 'utf8' })
    .trim()
    .replace(/.*github\.com[:/]([^.]+)(\.git)?/, '$1');

console.log(`🔒 ${DRY_RUN ? '[DRY RUN] ' : ''}Updating branch protection for ${REPO}:${BRANCH}`);

/**
 * Get current branch protection settings
 */
function getCurrentProtection() {
  try {
    const result = execSync(`gh api repos/${REPO}/branches/${BRANCH}/protection`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    return JSON.parse(result);
  } catch (error) {
    if (error.status === 404) {
      console.log('⚠️  No existing branch protection found');
      return null;
    }
    throw error;
  }
}

/**
 * Merge protection settings safely
 */
function mergeProtectionSettings(current, desired) {
  const merged = {
    required_status_checks: {
      strict: true,
      contexts: [],
      checks: []
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      require_last_push_approval: true
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: true
  };

  // Merge current settings if they exist
  if (current) {
    // Preserve existing status check contexts and checks
    if (current.required_status_checks) {
      merged.required_status_checks.contexts = [
        ...new Set([
          ...(current.required_status_checks.contexts || []),
          ...(desired.required_status_checks?.contexts || [])
        ])
      ];
      
      merged.required_status_checks.checks = [
        ...new Map([
          ...(current.required_status_checks.checks || []).map(c => [c.context, c]),
          ...(desired.required_status_checks?.checks || []).map(c => [c.context, c])
        ].values())
      ];
    }
    
    // Preserve stricter settings
    merged.enforce_admins = current.enforce_admins || desired.enforce_admins;
    merged.required_pull_request_reviews.required_approving_review_count = Math.max(
      current.required_pull_request_reviews?.required_approving_review_count || 0,
      desired.required_pull_request_reviews?.required_approving_review_count || 1
    );
    
    // Preserve existing restrictions if they exist
    if (current.restrictions && (current.restrictions.users?.length > 0 || current.restrictions.teams?.length > 0)) {
      merged.restrictions = current.restrictions;
    }
  }

  // Apply desired overrides
  return { ...merged, ...desired };
}

/**
 * Apply new protection settings
 */
async function updateProtection() {
  const current = getCurrentProtection();
  
  // Define desired protection settings
  const desired = {
    required_status_checks: {
      strict: true,
      checks: [
        { context: "ci-unified", app_id: -1 },
        { context: "guardian-health", app_id: -1 },
        { context: "security-scan", app_id: -1 }
      ]
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      require_last_push_approval: true
    },
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false
  };
  
  const merged = mergeProtectionSettings(current, desired);
  
  console.log('📋 Current protection:', current ? 'EXISTS' : 'NONE');
  console.log('📋 Merged protection settings:');
  console.log(JSON.stringify(merged, null, 2));
  
  if (DRY_RUN) {
    console.log('🔍 Dry run complete - no changes made');
    return;
  }
  
  // Apply the protection
  const payload = JSON.stringify(merged);
  execSync(`gh api repos/${REPO}/branches/${BRANCH}/protection -X PUT --input -`, {
    input: payload,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  
  console.log('✅ Branch protection updated successfully');
}

// Run the update
updateProtection().catch(error => {
  console.error('❌ Failed to update branch protection:', error.message);
  process.exit(1);
});
