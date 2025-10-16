/**
 * TS4111 Codemod - Fix Index Signature Access Errors
 *
 * Automatically fixes TypeScript TS4111 errors by converting dot notation
 * to bracket notation for index signature access.
 *
 * Error: Property 'X' comes from an index signature, so it must be accessed with ['X'].
 *
 * Transformations:
 * - process.env.FOO → process.env['FOO']
 * - req.app → req['app']
 * - res.setHeader → res['setHeader']
 *
 * Usage:
 *   npx jscodeshift -t scripts/codemods/fix-ts4111.ts <files> --parser=tsx
 */

import type { API, FileInfo, Options, Transform } from 'jscodeshift';

const transform: Transform = (file: FileInfo, api: API, options: Options) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  let hasChanges = false;

  // Pattern 1: process.env.X → process.env['X']
  // Matches: process.env.NODE_ENV, process.env.DATABASE_URL, etc.
  root
    .find(j.MemberExpression, {
      object: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'process' },
        property: { type: 'Identifier', name: 'env' }
      },
      computed: false  // Only fix dot notation (not already bracket)
    })
    .forEach(path => {
      const property = path.value.property;
      if (property.type === 'Identifier') {
        const propName = property.name;
        path.value.property = j.literal(propName);
        path.value.computed = true;
        hasChanges = true;
      }
    });

  // Pattern 2: req.app → req['app']
  // Matches: req.app.locals, req.app.get(), etc.
  root
    .find(j.MemberExpression, {
      object: { type: 'Identifier', name: 'req' },
      property: { type: 'Identifier', name: 'app' },
      computed: false
    })
    .forEach(path => {
      path.value.property = j.literal('app');
      path.value.computed = true;
      hasChanges = true;
    });

  // Pattern 3: response method calls (res.setHeader, res.write, res.end, etc.)
  // Only fix when it's actually a method call (has CallExpression parent)
  const responseMethods = [
    'setHeader',
    'getHeader',
    'removeHeader',
    'write',
    'end',
    'send',
    'json',
    'status',
    'redirect',
    'render'
  ];

  responseMethods.forEach(methodName => {
    root
      .find(j.CallExpression)
      .filter(path => {
        const callee = path.value.callee;
        return (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === methodName &&
          !callee.computed  // Only fix dot notation
        );
      })
      .forEach(path => {
        const callee = path.value.callee as any;
        callee.property = j.literal(methodName);
        callee.computed = true;
        hasChanges = true;
      });
  });

  // Pattern 4: router method calls (router.get, router.post, etc.)
  // These often have TS4111 errors with Express
  const routerMethods = ['get', 'post', 'put', 'delete', 'patch', 'use', 'all'];

  routerMethods.forEach(methodName => {
    root
      .find(j.CallExpression)
      .filter(path => {
        const callee = path.value.callee;
        return (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'router' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === methodName &&
          !callee.computed
        );
      })
      .forEach(path => {
        const callee = path.value.callee as any;
        callee.property = j.literal(methodName);
        callee.computed = true;
        hasChanges = true;
      });
  });

  return hasChanges ? root.toSource() : null;
};

// Export for jscodeshift
export default transform;
export const parser = 'tsx';
