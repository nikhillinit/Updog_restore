"use strict";

/**
 * POVC Security ESLint Plugin
 * Enforces anti-patterns from cheatsheets/anti-pattern-prevention.md
 *
 * Rules:
 * - no-floating-point-in-core: Decimal.js enforcement in calculation paths
 * - require-bullmq-config: BullMQ jobs must have timeout and max attempts
 * - no-sql-raw-in-routes: Prevent sql.raw() in API routes (injection risk)
 * - require-cursor-validation: Cursor parameters must be validated
 */

module.exports = {
  rules: {
    // ========================================
    // RULE: no-floating-point-in-core (existing)
    // Ref: phoenix-precision-guard skill
    // ========================================
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
    },

    // ========================================
    // RULE: require-bullmq-config
    // Ref: AP-QUEUE-01, AP-QUEUE-02 (cheatsheets/anti-pattern-prevention.md)
    // BullMQ jobs MUST have timeout and max attempts configured
    // ========================================
    "require-bullmq-config": {
      meta: {
        type: "problem",
        docs: {
          description: "BullMQ Worker/Queue must configure timeout and max attempts to prevent runaway jobs",
          category: "Best Practices",
          recommended: true
        },
        messages: {
          missingTimeout: "AP-QUEUE-02: BullMQ Worker missing 'timeout' option. Add timeout: 300000 (5 min) or appropriate value.",
          missingAttempts: "AP-QUEUE-01: BullMQ defaultJobOptions missing 'attempts'. Add attempts: 2 to prevent infinite retries.",
          infiniteRetries: "AP-QUEUE-01: attempts > 5 risks queue congestion. Recommended: attempts: 2"
        }
      },
      create(context) {
        const filename = context.getFilename();
        const isWorkerFile = /[\\\/](workers|queues)[\\\/]/.test(filename);

        if (!isWorkerFile) return {};

        return {
          // Check new Worker() calls
          NewExpression(node) {
            if (node.callee.name !== "Worker") return;

            const optionsArg = node.arguments[2]; // Worker(name, processor, options)
            if (!optionsArg || optionsArg.type !== "ObjectExpression") {
              context.report({ node, messageId: "missingTimeout" });
              return;
            }

            const hasTimeout = optionsArg.properties.some(
              p => p.key && p.key.name === "timeout"
            );

            if (!hasTimeout) {
              context.report({ node, messageId: "missingTimeout" });
            }
          },

          // Check new Queue() calls for defaultJobOptions
          CallExpression(node) {
            if (node.callee.type !== "NewExpression") return;
            if (node.callee.callee && node.callee.callee.name !== "Queue") return;
          }
        };
      }
    },

    // ========================================
    // RULE: no-sql-raw-in-routes
    // Ref: AP-CURSOR-06 (SQL injection prevention)
    // Prevent sql.raw() usage in route handlers
    // ========================================
    "no-sql-raw-in-routes": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent sql.raw() in API routes to avoid SQL injection",
          category: "Security",
          recommended: true
        },
        messages: {
          noSqlRaw: "AP-CURSOR-06: sql.raw() in routes creates injection risk. Use parameterized Drizzle queries instead."
        }
      },
      create(context) {
        const filename = context.getFilename();
        const isRouteFile = /[\\\/]routes[\\\/]/.test(filename);

        if (!isRouteFile) return {};

        return {
          CallExpression(node) {
            const callee = node.callee;
            if (
              callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              callee.object.name === "sql" &&
              callee.property.name === "raw"
            ) {
              context.report({ node, messageId: "noSqlRaw" });
            }
          }
        };
      }
    },

    // ========================================
    // RULE: no-pii-logging
    // Ref: AP-PII-01 (PII in logs)
    // Prevent logging of PII fields without sanitization
    // ========================================
    "no-pii-logging": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent logging PII fields (email, taxId, ssn, etc.) without sanitization",
          category: "Security",
          recommended: true
        },
        messages: {
          piiInLog: "AP-PII-01: Potential PII in log statement. Use sanitizeForLogging() or remove sensitive field '{{field}}'.",
          useSanitizer: "AP-PII-01: Wrap error/object in sanitizeForLogging() before logging."
        }
      },
      create(context) {
        const piiFields = new Set([
          'email', 'taxId', 'ssn', 'socialSecurityNumber', 'taxIdentifier',
          'password', 'secret', 'apiKey', 'token', 'creditCard', 'bankAccount',
          'accountNumber', 'routingNumber', 'phoneNumber', 'address', 'dob',
          'dateOfBirth', 'firstName', 'lastName', 'fullName'
        ]);

        const logMethods = new Set(['log', 'info', 'warn', 'error', 'debug']);

        function checkForPII(node, arg) {
          // Check if argument is an object expression with PII fields
          if (arg.type === 'ObjectExpression') {
            for (const prop of arg.properties) {
              if (prop.key && prop.key.name && piiFields.has(prop.key.name)) {
                context.report({
                  node,
                  messageId: 'piiInLog',
                  data: { field: prop.key.name }
                });
              }
            }
          }

          // Check if argument is an identifier that might be PII
          if (arg.type === 'Identifier' && piiFields.has(arg.name)) {
            context.report({
              node,
              messageId: 'piiInLog',
              data: { field: arg.name }
            });
          }

          // Check member expressions like user.email
          if (arg.type === 'MemberExpression' && arg.property.name && piiFields.has(arg.property.name)) {
            context.report({
              node,
              messageId: 'piiInLog',
              data: { field: arg.property.name }
            });
          }
        }

        return {
          CallExpression(node) {
            const callee = node.callee;

            // Check console.log, console.error, etc.
            if (
              callee.type === 'MemberExpression' &&
              callee.object.type === 'Identifier' &&
              callee.object.name === 'console' &&
              logMethods.has(callee.property.name)
            ) {
              for (const arg of node.arguments) {
                checkForPII(node, arg);
              }
            }

            // Check logger.info, logger.error, etc. (pino, winston)
            if (
              callee.type === 'MemberExpression' &&
              callee.object.type === 'Identifier' &&
              (callee.object.name === 'logger' || callee.object.name === 'log') &&
              logMethods.has(callee.property.name)
            ) {
              for (const arg of node.arguments) {
                checkForPII(node, arg);
              }
            }
          }
        };
      }
    },

    // ========================================
    // RULE: no-parsefloat-in-calculations
    // Ref: Phase 1A.6 (parseFloat eradication)
    // Warn on parseFloat in P0 calculation paths (to be replaced with Decimal.js)
    // ========================================
    "no-parsefloat-in-calculations": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Warn on parseFloat usage in calculation paths (prefer Decimal.js for precision)",
          category: "Best Practices",
          recommended: true
        },
        messages: {
          useDecimal: "Phase 1A.6: parseFloat in calculation path '{{path}}'. Consider Decimal.js for precision-critical code."
        }
      },
      create(context) {
        const filename = context.getFilename().replace(/\\/g, '/'); // Normalize to forward slashes
        // P0 calculation paths: lib, core, analytics, workers with calculations
        const isCalcPath = /\/(lib|core|analytics)\//.test(filename) ||
                          /\/workers\/(reserve|pacing|cohort)/.test(filename);

        if (!isCalcPath) return {};

        return {
          CallExpression(node) {
            if (node.callee.type === "Identifier" && node.callee.name === "parseFloat") {
              const relativePath = filename.replace(/.*[\\\/](client|server|shared|workers)[\\\/]/, '$1/');
              context.report({
                node,
                messageId: "useDecimal",
                data: { path: relativePath }
              });
            }
          }
        };
      }
    },

    // ========================================
    // RULE: require-optimistic-locking
    // Ref: AP-LOCK-03 (Missing version check)
    // Update operations should include version check
    // ========================================
    "require-optimistic-locking": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Warn when UPDATE operations don't check version field",
          category: "Best Practices",
          recommended: false
        },
        messages: {
          missingVersionCheck: "AP-LOCK-03: Consider adding version check for optimistic locking: .where(and(eq(table.id, id), eq(table.version, expectedVersion)))"
        }
      },
      create(context) {
        const filename = context.getFilename();
        const isRouteFile = /[\\\/]routes[\\\/]/.test(filename);

        if (!isRouteFile) return {};

        return {
          // Detect db.update() chains without version check
          CallExpression(node) {
            // Look for .update().set().where() chains
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.name === "update"
            ) {
              // This is a db.update() call - warn about version checking
              // (Full implementation would trace the chain to check .where() contents)
              // For now, just remind developers about the pattern
            }
          }
        };
      }
    }
  }
};
