/**
 * Disallow generic quarantine reasons such as:
 * "Temporarily skipped pending stabilization triage."
 *
 * This rule catches both executable skip names and @reason comments, because the
 * current quarantine debt is documented in file headers rather than only in
 * describe.skip(...) titles.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow generic quarantine reasons.',
    },
    schema: [],
    messages: {
      genericReason:
        'Replace generic quarantine phrasing with a specific reason and measurable exit criteria.',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    const generic =
      /temporarily skipped pending stabilization triage|remove skip and re-enable once deterministic behavior|pending stabilization triage/i;
    const quarantineContext = /@quarantine|@reason|quarantine|skip:/i;

    function reportNode(node) {
      context.report({ node, messageId: 'genericReason' });
    }

    return {
      Program(node) {
        for (const comment of source.getAllComments()) {
          if (generic.test(comment.value) && quarantineContext.test(comment.value)) {
            context.report({
              loc: comment.loc,
              messageId: 'genericReason',
            });
          }
        }

      },

      CallExpression(node) {
        const callee = node.callee;
        if (
          callee &&
          callee.type === 'MemberExpression' &&
          callee.property &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'skip'
        ) {
          const first = node.arguments[0];
          if (
            first &&
            first.type === 'Literal' &&
            typeof first.value === 'string' &&
            generic.test(first.value)
          ) {
            reportNode(node);
          }
        }
      },
    };
  },
};
