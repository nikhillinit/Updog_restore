/**
 * ESLint Rule: no-hardcoded-fund-metrics
 *
 * Prevents hardcoding of fund metrics in UI components.
 * This rule ensures all metrics are fetched from the Unified Metrics API
 * via the useFundMetrics() hook, maintaining a single source of truth.
 *
 * ❌ Bad:
 * ```js
 * const fundMetrics = { irr: 28.5, tvpi: 2.82, totalInvested: 85000000 };
 * ```
 *
 * ✅ Good:
 * ```js
 * const { data: metrics } = useFundMetrics();
 * const irr = metrics?.actual.irr;
 * ```
 *
 * @module eslint-rules/no-hardcoded-fund-metrics
 */

// Metric-related property names to detect
const METRIC_PROPERTIES = [
  'irr',
  'tvpi',
  'dpi',
  'rvpi',
  'moic',
  'totalInvested',
  'totalDeployed',
  'totalValue',
  'totalCommitted',
  'totalCalled',
  'currentNAV',
  'totalDistributions',
  'deploymentRate',
  'activeCompanies',
  'exitedCompanies',
  'fundMetrics',
  'portfolioMetrics',
  'actualMetrics',
  'projectedMetrics',
];

// Allowlisted file patterns (tests, mocks, types)
const ALLOWLIST_PATTERNS = [
  /__tests__\//,
  /\.test\./,
  /\.spec\./,
  /\.mock\./,
  /\.stories\./,
  /\/test\//,
  /\/tests\//,
  /\/mocks\//,
  /\/fixtures\//,
  /types\.ts$/,
  /\.d\.ts$/,
  /shared\/types\/metrics\.ts$/, // The type definitions themselves
];

/**
 * Check if a file is allowlisted
 */
function isAllowlistedFile(filename) {
  return ALLOWLIST_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Check if an object has suspicious metric properties
 */
function hasSuspiciousProperties(properties) {
  return properties.some((prop) => {
    if (prop.type !== 'Property') return false;
    if (prop.key.type === 'Identifier') {
      return METRIC_PROPERTIES.includes(prop.key.name);
    }
    if (prop.key.type === 'Literal') {
      return METRIC_PROPERTIES.includes(prop.key.value);
    }
    return false;
  });
}

/**
 * Check if a value looks like a financial metric (large number or percentage)
 */
function looksLikeFinancialValue(value) {
  if (value.type === 'Literal' && typeof value.value === 'number') {
    // Large numbers (> 1M) likely represent dollar amounts
    // Small decimals (0.0 - 10.0) likely represent multiples or rates
    const num = value.value;
    return (
      Math.abs(num) > 1_000_000 ||
      (num >= 0 && num <= 10 && num % 1 !== 0)
    );
  }
  return false;
}

/**
 * ESLint rule definition
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded fund metrics in UI components',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      hardcodedMetrics:
        'Do not hardcode fund metrics. Use the useFundMetrics() hook to fetch metrics from the Unified Metrics API. See client/src/hooks/useFundMetrics.ts for usage.',
      hardcodedFinancialValue:
        'This looks like a hardcoded financial metric ({{ value }}). Use useFundMetrics() to fetch actual data.',
    },
    schema: [], // No options
  },

  create(context) {
    const filename = context.getFilename();

    // Skip allowlisted files
    if (isAllowlistedFile(filename)) {
      return {};
    }

    return {
      /**
       * Detect object literals with metric properties
       *
       * const fundMetrics = { irr: 0.285, tvpi: 2.82, ... }
       */
      VariableDeclarator(node) {
        // Check if variable name contains "metrics"
        const isMetricsVariable =
          node.id.type === 'Identifier' &&
          (node.id.name.toLowerCase().includes('metrics') ||
            node.id.name.toLowerCase().includes('performance'));

        // Check if initializer is an object with suspicious properties
        if (
          node.init &&
          node.init.type === 'ObjectExpression' &&
          (isMetricsVariable || hasSuspiciousProperties(node.init.properties))
        ) {
          context.report({
            node: node.init,
            messageId: 'hardcodedMetrics',
          });
        }
      },

      /**
       * Detect object literals assigned to properties
       *
       * this.fundMetrics = { irr: 0.285, ... }
       */
      AssignmentExpression(node) {
        if (
          node.right.type === 'ObjectExpression' &&
          hasSuspiciousProperties(node.right.properties)
        ) {
          // Check if left side is a metrics-related property
          if (
            (node.left.type === 'MemberExpression' &&
              node.left.property.type === 'Identifier' &&
              (node.left.property.name.toLowerCase().includes('metrics') ||
                METRIC_PROPERTIES.includes(node.left.property.name))) ||
            (node.left.type === 'Identifier' &&
              node.left.name.toLowerCase().includes('metrics'))
          ) {
            context.report({
              node: node.right,
              messageId: 'hardcodedMetrics',
            });
          }
        }
      },

      /**
       * Detect suspicious numeric literals that look like financial data
       *
       * const totalInvested = 85000000;
       * const irr = 0.285;
       */
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          METRIC_PROPERTIES.includes(node.id.name) &&
          node.init &&
          looksLikeFinancialValue(node.init)
        ) {
          context.report({
            node: node.init,
            messageId: 'hardcodedFinancialValue',
            data: {
              value: node.init.value,
            },
          });
        }
      },
    };
  },
};
