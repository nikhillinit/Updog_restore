"use strict";

const { ESLintUtils } = require("@typescript-eslint/utils");

// Create rule with proper metadata
const createRule = ESLintUtils.RuleCreator(
  (name) => `https://internal/eslint-rules/${name}`
);

module.exports = createRule({
  name: "enforce-rls-transaction",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct db calls outside withRLSTransaction scope",
      recommended: "error",
    },
    schema: [],
    messages: {
      noDirectDb: "Direct 'db' calls are forbidden in route handlers. Use 'withRLSTransaction()(req,res,next)' middleware or 'executeWithContext()' for RLS enforcement.",
      noDirectTransaction: "Direct 'db.transaction()' calls are forbidden. Use 'executeWithContext()' which handles RLS context automatically.",
      noDirectQuery: "Direct SQL queries without RLS context. Wrap in 'executeWithContext()' or ensure middleware is applied.",
    },
  },
  defaultOptions: [],
  create(context) {
    let inWithRls = 0;
    let inExecuteWithContext = 0;
    let currentFunction = null;
    let isRouteFile = false;
    
    // Check if this is a route file
    const filename = context.getFilename();
    isRouteFile = filename.includes('/routes/') || filename.includes('/server/');
    
    // Track suspicious patterns
    const suspiciousPatterns = new Set([
      'db.select',
      'db.insert', 
      'db.update',
      'db.delete',
      'db.query',
      'db.execute',
      'db.transaction',
      'pgClient.query',
      'client.query',
    ]);
    
    return {
      // Track entering/exiting function scopes
      FunctionDeclaration(node) {
        currentFunction = node.id?.name || 'anonymous';
      },
      'FunctionDeclaration:exit'() {
        currentFunction = null;
      },
      
      FunctionExpression(node) {
        currentFunction = 'anonymous';
      },
      'FunctionExpression:exit'() {
        currentFunction = null;
      },
      
      ArrowFunctionExpression(node) {
        currentFunction = 'arrow';
      },
      'ArrowFunctionExpression:exit'() {
        currentFunction = null;
      },
      
      // Detect entering RLS-safe contexts
      CallExpression(node) {
        const callee = node.callee;
        
        // Check for withRLSTransaction wrapper
        if (callee.type === 'Identifier' && callee.name === 'withRLSTransaction') {
          inWithRls++;
        }
        
        // Check for executeWithContext wrapper
        if (callee.type === 'Identifier' && callee.name === 'executeWithContext') {
          inExecuteWithContext++;
        }
        
        // Only check in route files
        if (!isRouteFile) return;
        
        // Skip if we're in a safe context
        if (inWithRls > 0 || inExecuteWithContext > 0) return;
        
        // Check for direct db calls
        if (callee.type === 'MemberExpression') {
          const objectName = callee.object.type === 'Identifier' ? callee.object.name : null;
          const propertyName = callee.property.type === 'Identifier' ? callee.property.name : null;
          
          // Flag direct db usage
          if (objectName === 'db') {
            // Special case for db.transaction - needs different message
            if (propertyName === 'transaction') {
              context.report({
                node,
                messageId: 'noDirectTransaction',
              });
            } else if (['select', 'insert', 'update', 'delete', 'query', 'execute'].includes(propertyName)) {
              context.report({
                node,
                messageId: 'noDirectDb',
              });
            }
          }
          
          // Also flag direct client queries
          if ((objectName === 'pgClient' || objectName === 'client') && propertyName === 'query') {
            context.report({
              node,
              messageId: 'noDirectQuery',
            });
          }
        }
        
        // Check for chained db calls (e.g., db.select().from())
        if (callee.type === 'MemberExpression' && callee.object.type === 'CallExpression') {
          const innerCallee = callee.object.callee;
          if (innerCallee.type === 'MemberExpression') {
            const objectName = innerCallee.object.type === 'Identifier' ? innerCallee.object.name : null;
            if (objectName === 'db') {
              context.report({
                node,
                messageId: 'noDirectDb',
              });
            }
          }
        }
      },
      
      // Track exiting RLS-safe contexts
      'CallExpression:exit'(node) {
        const callee = node.callee;
        
        if (callee.type === 'Identifier') {
          if (callee.name === 'withRLSTransaction' && inWithRls > 0) {
            inWithRls--;
          }
          if (callee.name === 'executeWithContext' && inExecuteWithContext > 0) {
            inExecuteWithContext--;
          }
        }
      },
    };
  },
});