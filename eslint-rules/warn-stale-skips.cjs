/**
 * ESLint rule: warn-stale-skips
 *
 * Flags describe.skip / it.skip / test.skip calls that lack an
 * adjacent justification comment (e.g., // SKIP: reason).
 *
 * Rationale: skip annotations accumulate silently. This rule makes
 * every skip visible in lint output so stale ones are caught in CI.
 * Suppress per-line with: // eslint-disable-next-line local/warn-stale-skips
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Warn on .skip() test calls without justification comment',
      category: 'Best Practices',
      recommended: false,
    },
    messages: {
      staleSkip:
        '{{callee}}.skip detected without justification. Add a "// SKIP: reason" comment on the preceding line, or remove the skip.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        // Match: describe.skip(...), it.skip(...), test.skip(...)
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.name !== 'skip'
        ) {
          return;
        }

        const obj = node.callee.object;
        if (obj.type !== 'Identifier') return;
        if (!['describe', 'it', 'test'].includes(obj.name)) return;

        // Check for justification comment on the preceding line
        const comments = sourceCode.getCommentsBefore(node);
        const hasJustification = comments.some(
          (c) => /SKIP\s*:/i.test(c.value)
        );

        if (!hasJustification) {
          context.report({
            node: node.callee.property,
            messageId: 'staleSkip',
            data: { callee: obj.name },
          });
        }
      },
    };
  },
};
