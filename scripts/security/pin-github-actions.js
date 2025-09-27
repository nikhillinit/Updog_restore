#!/usr/bin/env node

/**
 * Script to pin GitHub Actions to specific commit SHAs
 * This improves supply chain security by preventing unexpected changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map of common actions to their pinned SHAs (as of Dec 2024)
// These are the latest stable commits for each major version
const ACTION_PINS = {
  'actions/checkout@v4': 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683', // v4.2.2
  'actions/setup-node@v4': 'actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af', // v4.1.0
  'actions/cache@v4': 'actions/cache@6849a6489940f00c2f30c0fb92c6274307ccb58a', // v4.1.2
  'actions/upload-artifact@v4': 'actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882', // v4.4.3
  'actions/download-artifact@v4': 'actions/download-artifact@fa0a91b85d4f404e444e00e005971372dc801d16', // v4.1.8
  'actions/github-script@v7': 'actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea', // v7.0.1
  'actions/labeler@v5': 'actions/labeler@8558fd74291d67161a8a78ce36a881fa63b766a9', // v5.0.0
  'actions/setup-python@v5': 'actions/setup-python@0a5c61591373683505ea898e09a3ea4f39ef2b9c', // v5.0.0
  'actions/create-release@v1': 'actions/create-release@0cb9c9b65d5d1901c1f53e5e66eaf4afd303e70e', // v1.1.4
  'codecov/codecov-action@v3': 'codecov/codecov-action@e28ff129e5465c2c0dcc6f003fc735cb6ae0c673', // v3.1.4
  'docker/setup-buildx-action@v3': 'docker/setup-buildx-action@f95db51fddba0c2d1ec667646a06c2ce06100226', // v3.0.0
  'docker/login-action@v3': 'docker/login-action@343f7c4344506bcbf9b4de18042ae17996df046d', // v3.0.0
  'docker/build-push-action@v5': 'docker/build-push-action@4a13e500e55cf31b7a5d59a38ab2040ab0f42f56', // v5.1.0
};

function pinActionsInFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;
  let changes = [];
  
  // Find all uses: statements
  const usesRegex = /uses:\s*([^\s]+)/g;
  let match;
  
  while ((match = usesRegex.exec(content)) !== null) {
    const fullAction = match[1];
    
    // Skip if already pinned to a SHA
    if (fullAction.match(/@[a-f0-9]{40}/)) {
      continue;
    }
    
    // Check if we have a pin for this action
    const baseAction = fullAction.replace(/@.*$/, '');
    const versionTag = fullAction.match(/@(.*)$/)?.[1];
    
    // Look for exact match or base match
    let pinnedVersion = ACTION_PINS[fullAction];
    
    if (!pinnedVersion && versionTag) {
      // Try to find a similar version
      const possibleKey = `${baseAction}@${versionTag}`;
      pinnedVersion = ACTION_PINS[possibleKey];
    }
    
    if (pinnedVersion) {
      content = content.replace(
        new RegExp(`uses:\\s*${fullAction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
        `uses: ${pinnedVersion}`
      );
      changes.push(`  - ${fullAction} → ${pinnedVersion}`);
    } else if (!fullAction.includes('step-security/harden-runner')) {
      console.warn(`  ⚠️  No pin found for: ${fullAction}`);
      console.warn(`      Please manually pin this action to a specific commit SHA`);
    }
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Updated ${filePath}:`);
    changes.forEach(change => console.log(change));
  } else {
    console.log(`  No changes needed`);
  }
  
  return changes.length;
}

function pinAllWorkflows() {
  const workflowDir = path.join(__dirname, '..', '..', '.github', 'workflows');
  
  if (!fs.existsSync(workflowDir)) {
    console.error('❌ .github/workflows directory not found');
    process.exit(1);
  }
  
  const files = fs.readdirSync(workflowDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  
  console.log(`Found ${files.length} workflow files\n`);
  
  let totalChanges = 0;
  
  for (const file of files) {
    const filePath = path.join(workflowDir, file);
    totalChanges += pinActionsInFile(filePath);
    console.log('');
  }
  
  console.log(`\n✨ Total changes: ${totalChanges}`);
  
  if (totalChanges > 0) {
    console.log('\n📝 Next steps:');
    console.log('1. Review the changes');
    console.log('2. Test workflows in a branch');
    console.log('3. Commit with message: "chore: pin GitHub Actions to commit SHAs for security"');
  }
}

// Add verification script
function createVerificationScript() {
  const scriptContent = `#!/bin/bash
# Script to verify all GitHub Actions are pinned to SHAs

set -euo pipefail

echo "🔍 Checking for unpinned GitHub Actions..."

unpinned=$(grep -r "uses:" .github/workflows/*.yml \\
  | grep -v "@[a-f0-9]\\{40\\}" \\
  | grep -v "step-security/harden-runner" || true)

if [ -n "$unpinned" ]; then
  echo "❌ Found unpinned actions:"
  echo "$unpinned"
  exit 1
else
  echo "✅ All actions are pinned to commit SHAs"
fi
`;

  const scriptPath = path.join(__dirname, 'verify-pinned-actions.sh');
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  console.log(`\n📄 Created verification script: ${scriptPath}`);
}

// Run the script
console.log('🔐 Pinning GitHub Actions to commit SHAs\n');
pinAllWorkflows();
createVerificationScript();