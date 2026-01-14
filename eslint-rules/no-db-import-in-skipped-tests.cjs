/**
 * ESLint rule: no-db-import-in-skipped-tests
 *
 * Flags describe.skip files that import from server/db.
 * This prevents pool creation at import time when tests are skipped.
 *
 * @see docs/plans/option2-session-logs/task_plan.md - AP-TEST-DB-05
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow top-level DB imports in skipped test files',
      category: 'Best Practices',
      recommended: false,
    },
    messages: {
      noDbImportInSkipped:
        'Top-level DB import in skipped test creates pool at import time. Use dynamic import inside beforeAll instead. See: docs/plans/2026-01-13-integration-test-cleanup.md',
    },
    schema: [],
  },
  create(context) {
    let hasDescribeSkip = false;
    const dbImports = [];

    return {
      // Detect describe.skip calls
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'describe' &&
          node.callee.property.name === 'skip'
        ) {
          hasDescribeSkip = true;
        }
      },

      // Track imports from server/db
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          typeof source === 'string' &&
          (source.includes('server/db') || source.includes('@/server/db'))
        ) {
          dbImports.push(node);
        }
      },

      // At end of file, report if both conditions met
      'Program:exit'() {
        if (hasDescribeSkip && dbImports.length > 0) {
          dbImports.forEach((node) => {
            context.report({
              node,
              messageId: 'noDbImportInSkipped',
            });
          });
        }
      },
    };
  },
};
