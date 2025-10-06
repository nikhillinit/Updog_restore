"use strict";

module.exports = {
  rules: {
    "no-floating-point-in-core": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow ambient Number arithmetic and Math.* in core AI evaluation paths (determinism requirement)",
          category: "Best Practices",
          recommended: true
        },
        messages: {
          useDecimal: "Use Decimal.js (not Number literals) for deterministic math in {{path}}",
          noMath: "Use Decimal.* methods instead of Math.* in {{path}}"
        }
      },
      create(context) {
        const filename = context.getFilename();
        const isCore = /[\\\/](ai|core[\\\/]reserves)[\\\/]/.test(filename);

        if (!isCore) return {};

        const forbiddenOps = new Set(["+", "-", "*", "/", "%", "**"]);

        return {
          BinaryExpression(node) {
            if (!forbiddenOps.has(node.operator)) return;

            const leftIsNumber = node.left.type === "Literal" && typeof node.left.value === "number";
            const rightIsNumber = node.right.type === "Literal" && typeof node.right.value === "number";

            if (leftIsNumber || rightIsNumber) {
              context.report({
                node,
                messageId: "useDecimal",
                data: { path: "ai/** or core/reserves/**" }
              });
            }
          },

          CallExpression(node) {
            const callee = node.callee;
            if (
              callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              callee.object.name === "Math"
            ) {
              context.report({
                node,
                messageId: "noMath",
                data: { path: "ai/** or core/reserves/**" }
              });
            }
          }
        };
      }
    }
  }
};
