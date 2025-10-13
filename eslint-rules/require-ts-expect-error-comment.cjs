/**
 * ESLint Rule: require-ts-expect-error-comment
 *
 * Enforces that all @ts-expect-error directives include a descriptive comment
 * explaining WHY the error is being suppressed.
 *
 * Rationale:
 * - Undocumented @ts-expect-error directives become technical debt
 * - Forces developers to justify type suppressions
 * - Makes code reviews more effective
 * - Helps future maintainers understand intent
 *
 * Example (FAIL):
 *   // @ts-expect-error
 *   const result = unsafeFunction();
 *
 * Example (PASS):
 *   // @ts-expect-error - Legacy API returns 'any', validated at runtime with Zod
 *   const result = legacyAPI.getData();
 *
 * References:
 * - TypeScript handbook: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require descriptive comments for @ts-expect-error directives',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      missingComment:
        '@ts-expect-error must include a descriptive comment explaining why the error is suppressed. ' +
        'Example: // @ts-expect-error - Legacy API returns any, validated at runtime',
    },
    schema: [
      {
        type: 'object',
        properties: {
          minCommentLength: {
            type: 'number',
            minimum: 10,
            default: 20,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const minCommentLength = options.minCommentLength || 20;

    const sourceCode = context.getSourceCode();

    return {
      Program() {
        const comments = sourceCode.getAllComments();

        for (const comment of comments) {
          // Check if comment contains @ts-expect-error
          if (!comment.value.includes('@ts-expect-error')) {
            continue;
          }

          // Extract the comment text after @ts-expect-error
          const match = comment.value.match(/@ts-expect-error\s*(-\s*)?(.*)/);

          if (!match) {
            continue;
          }

          const [, , explanation] = match;

          // Check if explanation exists and meets minimum length
          if (!explanation || explanation.trim().length < minCommentLength) {
            context.report({
              loc: comment.loc,
              messageId: 'missingComment',
            });
          }
        }
      },
    };
  },
};
