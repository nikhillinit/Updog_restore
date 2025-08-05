#!/usr/bin/env node

/**
 * Safe branch protection update using GraphQL API
 * Merges new requirements with existing rules to avoid accidental resets
 */

import { execSync } from 'child_process';

const REQUIRED_CHECKS = [
  'Slack Regression Guard',
  'Perf Check'
];

async function getBranchProtectionRuleId(owner, repo) {
  try {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          branchProtectionRules(first: 1) {
            nodes {
              id
              requiredStatusCheckContexts
              requiresStrictStatusChecks
            }
          }
        }
      }
    `;
    
    const result = execSync(`gh api graphql -f query='${query}' -f owner="${owner}" -f repo="${repo}"`, {
      encoding: 'utf8'
    });
    
    const data = JSON.parse(result);
    const rule = data.data?.repository?.branchProtectionRules?.nodes?.[0];
    
    return rule;
  } catch (error) {
    console.error('Failed to get branch protection rule:', error.message);
    return null;
  }
}

async function updateBranchProtection(ruleId, existingChecks = []) {
  try {
    // Merge existing checks with required ones, avoiding duplicates
    const allChecks = [...new Set([...existingChecks, ...REQUIRED_CHECKS])];
    
    const mutation = `
      mutation($input: UpdateBranchProtectionRuleInput!) {
        updateBranchProtectionRule(input: $input) {
          clientMutationId
        }
      }
    `;
    
    const input = {
      branchProtectionRuleId: ruleId,
      requiresStrictStatusChecks: true,
      requiredStatusCheckContexts: allChecks
    };
    
    execSync(`gh api graphql -f query='${mutation}' -F input='${JSON.stringify(input)}'`, {
      encoding: 'utf8'
    });
    
    console.log('✅ Branch protection updated successfully');
    console.log(`📋 Required checks: ${allChecks.join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to update branch protection:', error.message);
    return false;
  }
}

async function createBranchProtection(owner, repo) {
  try {
    const mutation = `
      mutation($input: CreateBranchProtectionRuleInput!) {
        createBranchProtectionRule(input: $input) {
          clientMutationId
        }
      }
    `;
    
    const input = {
      repositoryId: await getRepositoryId(owner, repo),
      pattern: 'main',
      requiresStrictStatusChecks: true,
      requiredStatusCheckContexts: REQUIRED_CHECKS,
      requiresCodeOwnerReviews: false,
      dismissesStaleReviews: false,
      restrictsReviewDismissals: false
    };
    
    execSync(`gh api graphql -f query='${mutation}' -F input='${JSON.stringify(input)}'`, {
      encoding: 'utf8'
    });
    
    console.log('✅ Branch protection rule created');
    return true;
  } catch (error) {
    console.error('❌ Failed to create branch protection:', error.message);
    return false;
  }
}

async function getRepositoryId(owner, repo) {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
      }
    }
  `;
  
  const result = execSync(`gh api graphql -f query='${query}' -f owner="${owner}" -f repo="${repo}"`, {
    encoding: 'utf8'
  });
  
  return JSON.parse(result).data.repository.id;
}

async function main() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'owner/repo').split('/');
  
  console.log(`🔒 Updating branch protection for ${owner}/${repo}`);
  
  // Get existing rule
  const existingRule = await getBranchProtectionRuleId(owner, repo);
  
  if (existingRule) {
    console.log('📋 Found existing branch protection rule');
    console.log(`📋 Current checks: ${existingRule.requiredStatusCheckContexts?.join(', ') || 'none'}`);
    
    // Update existing rule (merges with current settings)
    await updateBranchProtection(
      existingRule.id, 
      existingRule.requiredStatusCheckContexts || []
    );
  } else {
    console.log('📋 No existing rule found, creating new one');
    await createBranchProtection(owner, repo);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { updateBranchProtection, getBranchProtectionRuleId };
