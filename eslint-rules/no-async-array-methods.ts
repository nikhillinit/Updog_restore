import { Rule } from 'eslint';
import * as ESTree from 'estree';

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow async callbacks in array methods that don\'t handle promises',
      url: 'https://github.com/nikhillinit/Updog_restore/blob/main/docs/dev/async-iteration.md'
    },
    fixable: 'code',
    schema: [],
    messages: {
      useForEachAsync: 'Use forEachAsync for async callbacks instead of forEach',
      useAsyncUtility: 'Use async-safe array utility for {{method}} with async callbacks'
    }
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    // Check if forEachAsync is already imported
    function hasForEachAsyncImport(): boolean {
      const program = sourceCode.ast;
      for (const node of program.body) {
        if (
          node.type === 'ImportDeclaration' &&
          node.source.value &&
          (node.source.value as string).includes('async-iteration')
        ) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === 'forEachAsync'
            ) {
              return true;
            }
          }
        }
      }
      return false;
    }

    // Find the best position to insert import
    function getImportInsertPosition(): number {
      const program = sourceCode.ast;
      let lastImportIndex = -1;
      
      for (let i = 0; i < program.body.length; i++) {
        if (program.body[i].type === 'ImportDeclaration') {
          lastImportIndex = i;
        }
      }

      if (lastImportIndex >= 0) {
        const lastImport = program.body[lastImportIndex];
        return lastImport.range![1];
      }

      // No imports found, insert at the beginning
      return 0;
    }

    // Add import for forEachAsync
    function* addForEachAsyncImport(fixer: Rule.RuleFixer): IterableIterator<Rule.Fix> {
      const program = sourceCode.ast;
      
      // Check if there's already an import from utils/async-iteration
      for (const node of program.body) {
        if (
          node.type === 'ImportDeclaration' &&
          node.source.value === 'utils/async-iteration'
        ) {
          // Add forEachAsync to existing import
          const lastSpecifier = node.specifiers[node.specifiers.length - 1];
          if (lastSpecifier) {
            yield fixer.insertTextAfter(lastSpecifier, ', forEachAsync');
            return;
          }
        }
      }

      // No existing import from utils/async-iteration, add new import
      const insertPosition = getImportInsertPosition();
      const importStatement = `import { forEachAsync } from 'utils/async-iteration';\n`;
      
      if (insertPosition === 0) {
        yield fixer.insertTextBeforeRange([0, 0], importStatement);
      } else {
        yield fixer.insertTextAfterRange([insertPosition, insertPosition], '\n' + importStatement);
      }
    }

    return {
      CallExpression(node: ESTree.CallExpression) {
        // Check if this is a method call on an array
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier'
        ) {
          return;
        }

        const methodName = node.callee.property.name;
        const arrayMethods = ['forEach', 'map', 'filter', 'reduce'];

        if (!arrayMethods.includes(methodName)) {
          return;
        }

        // Check if the first argument is an async function
        const firstArg = node.arguments[0];
        if (!firstArg) {
          return;
        }

        let isAsync = false;
        if (
          (firstArg.type === 'ArrowFunctionExpression' && firstArg.async) ||
          (firstArg.type === 'FunctionExpression' && firstArg.async)
        ) {
          isAsync = true;
        }

        if (!isAsync) {
          return;
        }

        // For now, only auto-fix forEach
        // TODO: Expand fixer to handle mapAsync, filterAsync, reduceAsync
        if (methodName === 'forEach') {
          context.report({
            node,
            messageId: 'useForEachAsync',
            *fix(fixer) {
              // Add import if needed
              if (!hasForEachAsyncImport()) {
                yield* addForEachAsyncImport(fixer);
              }

              // Replace forEach with forEachAsync
              const memberExpression = node.callee as ESTree.MemberExpression;
              const object = memberExpression.object;
              const callback = node.arguments[0];
              
              // Check if the parent is already an await expression
              const parent = sourceCode.getNodeByRangeIndex(node.range![0] - 1);
              const needsAwait = parent?.type !== 'AwaitExpression';

              const objectText = sourceCode.getText(object);
              const callbackText = sourceCode.getText(callback);
              const additionalArgs = node.arguments.slice(1).map(arg => sourceCode.getText(arg)).join(', ');
              
              let replacement = `forEachAsync(${objectText}, ${callbackText}`;
              if (additionalArgs) {
                replacement += `, ${additionalArgs}`;
              }
              replacement += ')';

              if (needsAwait) {
                replacement = `await ${replacement}`;
              }

              yield fixer.replaceText(node, replacement);
            }
          });
        } else {
          // For other methods, just report without fix
          context.report({
            node,
            messageId: 'useAsyncUtility',
            data: { method: methodName }
          });
        }
      }
    };
  }
};

export default rule;
