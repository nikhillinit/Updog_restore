/**
 * ESLint rule: no-async-array-methods
 * 
 * Prevents usage of native array methods like forEach, map, filter with async callbacks
 * and suggests using the async-safe utilities instead.
 * 
 * This rule provides autofix capabilities to replace problematic patterns with
 * safe async alternatives.
 */

const asyncArrayMethods = [
  'forEach',
  'map',
  'filter',
  'reduce',
  'find',
  'some',
  'every'
];

const asyncUtilityMap = {
  'forEach': 'forEachAsync',
  'map': 'mapAsync', 
  'filter': 'filterAsync',
  'reduce': 'reduceAsync',
  'find': 'findAsync',
  'some': 'someAsync',
  'every': 'everyAsync'
};

function isAsyncFunction(node) {
  // Check if the function is async
  if (node.async) return true;
  
  // Check if it's an arrow function with async
  if (node.type === 'ArrowFunctionExpression' && node.async) return true;
  
  // Check if the function body contains await
  if (hasAwait(node)) return true;
  
  return false;
}

function hasAwait(node) {
  if (!node) return false;
  
  if (node.type === 'AwaitExpression') return true;
  
  // Recursively check child nodes
  for (const key in node) {
    if (key === 'parent') continue; // Avoid circular references
    
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && hasAwait(item)) {
          return true;
        }
      }
    } else if (value && typeof value === 'object' && hasAwait(value)) {
      return true;
    }
  }
  
  return false;
}

function getAsyncIterationImport(context) {
  const program = context.getSourceCode().ast;
  
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration' && 
        (node.source.value.includes('async-iteration') || 
         node.source.value.includes('utils/async-iteration'))) {
      return node;
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent async array method usage and suggest async-safe alternatives',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      asyncArrayMethod: 'Avoid using {{method}} with async callbacks. Use {{asyncMethod}} instead for proper async handling.',
      missingImport: 'Import async utilities to use {{asyncMethod}}. Add: import { {{asyncMethod}} } from "../../utils/async-iteration"',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // Check if this is a call to an array method
        if (node.callee.type !== 'MemberExpression') return;
        
        const methodName = node.callee.property?.name;
        if (!asyncArrayMethods.includes(methodName)) return;
        
        // Check if the callback is async or contains await
        const callback = node.arguments[0];
        if (!callback || !isAsyncFunction(callback)) return;
        
        const asyncMethodName = asyncUtilityMap[methodName];
        const existingImport = getAsyncIterationImport(context);
        
        context.report({
          node,
          messageId: 'asyncArrayMethod',
          data: {
            method: methodName,
            asyncMethod: asyncMethodName,
          },
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const fixes = [];
            
            // Replace the method call
            const objectText = sourceCode.getText(node.callee.object);
            const argsText = node.arguments.map(arg => sourceCode.getText(arg)).join(', ');
            const replacement = `await ${asyncMethodName}(${objectText}, ${argsText})`;
            
            fixes.push(fixer.replaceText(node, replacement));
            
            // Add import if needed
            if (!existingImport) {
              const program = context.getSourceCode().ast;
              const firstImport = program.body.find(node => node.type === 'ImportDeclaration');
              
              let importPath = '../../utils/async-iteration';
              // Try to determine the correct relative path based on file location
              const filename = context.getFilename();
              if (filename.includes('client/src/pages/')) {
                importPath = '../../utils/async-iteration';
              } else if (filename.includes('client/src/components/')) {
                importPath = '../../utils/async-iteration';
              } else if (filename.includes('workers/')) {
                importPath = '../client/src/utils/async-iteration';
              }
              
              const importStatement = `import { ${asyncMethodName} } from "${importPath}";\n`;
              
              if (firstImport) {
                fixes.push(fixer.insertTextBefore(firstImport, importStatement));
              } else {
                fixes.push(fixer.insertTextBefore(program.body[0], importStatement));
              }
            } else {
              // Check if the specific method is already imported
              const importedMethods = existingImport.specifiers
                .filter(spec => spec.type === 'ImportSpecifier')
                .map(spec => spec.imported.name);
              
              if (!importedMethods.includes(asyncMethodName)) {
                // Add to existing import
                const lastSpecifier = existingImport.specifiers[existingImport.specifiers.length - 1];
                fixes.push(fixer.insertTextAfter(lastSpecifier, `, ${asyncMethodName}`));
              }
            }
            
            return fixes;
          },
        });
      },
    };
  },
};
