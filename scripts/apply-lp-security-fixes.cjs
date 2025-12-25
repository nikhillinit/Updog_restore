/**
 * Apply Security Fixes to LP API Routes
 *
 * This script applies the following security fixes:
 * 1. Add crypto utility imports
 * 2. Sanitize all error logging (PII redaction)
 * 3. Implement signed cursors for pagination
 */

const fs = require('fs');
const path = require('path');

const LP_API_PATH = path.join(__dirname, '../server/routes/lp-api.ts');

console.log('Reading lp-api.ts...');
let content = fs.readFileSync(LP_API_PATH, 'utf8');

// Fix 1: Add imports after lpAuditLogger import
console.log('Adding crypto imports...');
const importTarget = "import { lpAuditLogger } from '../services/lp-audit-logger';";
const importReplacement = `import { lpAuditLogger } from '../services/lp-audit-logger';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { sanitizeForLogging } from '../lib/crypto/pii-sanitizer';`;

if (content.includes(importTarget) && !content.includes('cursor-signing')) {
  content = content.replace(importTarget, importReplacement);
  console.log('  ✓ Added crypto imports');
} else {
  console.log('  - Imports already present or target not found');
}

// Fix 2: Sanitize all error logging
console.log('Sanitizing error logging...');
const errorLogs = [
  "console.error('LP profile API error:', error);",
  "console.error('LP summary API error:', error);",
  "console.error('Capital account API error:', error);",
  "console.error('Fund detail API error:', error);",
  "console.error('Holdings API error:', error);",
  "console.error('Performance API error:', error);",
  "console.error('Benchmark API error:', error);",
  "console.error('Report generation API error:', error);",
  "console.error('Reports list API error:', error);",
  "console.error('Report status API error:', error);",
  "console.error('Report download API error:', error);",
];

let sanitizedCount = 0;
errorLogs.forEach(log => {
  const sanitized = log.replace('error);', 'sanitizeForLogging(error));');
  const count = (content.match(new RegExp(escapeRegex(log), 'g')) || []).length;
  content = content.split(log).join(sanitized);
  sanitizedCount += count;
});
console.log(`  ✓ Sanitized ${sanitizedCount} error log statements`);

// Fix 3: Add cursor verification in capital-account endpoint
console.log('Adding signed cursor support...');
const cursorVerificationCode = `      // Validate query parameters
      const query = CapitalAccountQuerySchema.parse(req.query);

      // Verify and decode cursor if provided (prevents SQL injection)
      let startOffset = 0;
      if (query.cursor) {
        try {
          const cursorPayload = verifyCursor<{ offset: number; limit: number }>(query.cursor);
          startOffset = cursorPayload.offset;
        } catch (error) {
          const duration = endTimer();
          recordLPRequest(endpoint, 'GET', 400, duration, lpId);
          recordError(endpoint, 'INVALID_CURSOR', 400);
          return res.status(400).json(
            createErrorResponse('INVALID_CURSOR', 'Pagination cursor is invalid or tampered')
          );
        }
      }

      // Get all commitments for this LP (filtered by fundIds if provided)`;

const cursorTarget = `      // Validate query parameters
      const query = CapitalAccountQuerySchema.parse(req.query);

      // Get all commitments for this LP (filtered by fundIds if provided)`;

if (content.includes(cursorTarget) && !content.includes('INVALID_CURSOR')) {
  content = content.replace(cursorTarget, cursorVerificationCode);
  console.log('  ✓ Added cursor verification');
} else {
  console.log('  - Cursor verification already present or target not found');
}

// Fix 4: Update pagination logic to use startOffset
console.log('Updating pagination logic...');
const paginationTarget = `      // Apply pagination
      const limit = query.limit || 50;
      const paginatedTransactions = transactions.slice(0, limit);
      const hasMore = transactions.length > limit;`;

const paginationReplacement = `      // Apply pagination with cursor offset
      const limit = query.limit || 50;
      const paginatedTransactions = transactions.slice(startOffset, startOffset + limit);
      const hasMore = transactions.length > startOffset + limit;`;

if (content.includes(paginationTarget)) {
  content = content.replace(paginationTarget, paginationReplacement);
  console.log('  ✓ Updated pagination logic');
} else {
  console.log('  - Pagination already updated or target not found');
}

// Fix 5: Create signed cursor
console.log('Adding signed cursor generation...');
const cursorGenerationTarget = `      return res.json({
        transactions: responseTransactions,
        nextCursor: hasMore ? \`cursor_\${limit}\` : null,
        hasMore,
      });`;

const cursorGenerationReplacement = `      // Create signed cursor for next page (prevents tampering)
      const nextCursor = hasMore
        ? createCursor({ offset: startOffset + limit, limit })
        : null;

      return res.json({
        transactions: responseTransactions,
        nextCursor,
        hasMore,
      });`;

if (content.includes('cursor_${limit}')) {
  content = content.replace(cursorGenerationTarget, cursorGenerationReplacement);
  console.log('  ✓ Added signed cursor generation');
} else {
  console.log('  - Signed cursor already present or target not found');
}

// Write the updated file
console.log('\nWriting updated lp-api.ts...');
fs.writeFileSync(LP_API_PATH, content, 'utf8');
console.log('✓ Security fixes applied successfully!');

// Helper function
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
