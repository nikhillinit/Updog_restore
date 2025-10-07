/**
 * ESLint rule to prevent unsafe forEach usage and enforce centralized array-safety utility
 * @fileoverview Rule to catch patterns like (array || []).forEach() and suggest using centralized utility
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce use of centralized array-safety utilities instead of inline null-safe patterns',
      category: 'Possible Errors',
      recommended: true
    },
    fixable: 'code',
    schema: []
  },

  create(context) {
    return {
      // Catch (array || []).forEach() patterns
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.name === 'forEach' &&
          node.callee.object.type === 'LogicalExpression' &&
          node.callee.object.operator === '||' &&
          node.callee.object.right.type === 'ArrayExpression' &&
          node.callee.object.right.elements.length === 0
        ) {
          context.report({
            node,
            message: 'Use centralized array-safety utilities instead of (array || []).forEach(). Import { forEach } from "utils/array-safety"',
            fix(fixer) {
              const arrayName = context.getSourceCode().getText(node.callee.object.left);
              const callback = context.getSourceCode().getText(node.arguments[0]);
              const thisArg = node.arguments[1] ? `, ${context.getSourceCode().getText(node.arguments[1])}` : '';
              
              return fixer.replaceText(node, `forEach(${arrayName}, ${callback}${thisArg})`);
            }
          });
        }
        
        // Catch array?.forEach() patterns
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.name === 'forEach' &&
          node.callee.optional === true
        ) {
          context.report({
            node,
            message: 'Use centralized array-safety utilities instead of array?.forEach(). Import { forEach } from "utils/array-safety"',
            fix(fixer) {
              const arrayName = context.getSourceCode().getText(node.callee.object);
              const callback = context.getSourceCode().getText(node.arguments[0]);
              const thisArg = node.arguments[1] ? `, ${context.getSourceCode().getText(node.arguments[1])}` : '';
              
              return fixer.replaceText(node, `forEach(${arrayName}, ${callback}${thisArg})`);
            }
          });
        }
      }
    };
  }
};
