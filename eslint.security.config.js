/**
 * ESLint Security Configuration - Flat Config Format (ESLint 9.x)
 * Enforces security best practices and prevents common vulnerabilities
 * Updated: 2025-12-19 - Converted to flat config format
 */

import ts from '@typescript-eslint/eslint-plugin';

const tsPlugin = { '@typescript-eslint': ts };

// Base security rules applied to all files
const baseSecurityRules = {
  // Prevent dangerous global functions
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',

  // Prevent prototype pollution
  'no-proto': 'error',
  'no-extend-native': 'error',

  // Async/await best practices
  'no-async-promise-executor': 'error',
  'require-atomic-updates': 'error',
};

// Command injection prevention rules
const commandInjectionRules = {
  // Prevent command injection - use safe wrappers
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'child_process',
          message:
            'Import from child_process is restricted. Use execFile/execFileSync (not exec/execSync) with array args, or use scripts/lib/git-security.mjs for Git operations.',
        },
      ],
      patterns: [
        {
          group: ['*/child_process'],
          message:
            'Import from child_process is restricted. Use execFile/execFileSync (not exec/execSync) with array args, or use scripts/lib/git-security.mjs for Git operations.',
        },
      ],
    },
  ],

  // Prevent unsafe property access
  'no-restricted-properties': [
    'error',
    {
      object: 'child_process',
      property: 'exec',
      message: 'UNSAFE: exec() enables shell injection. Use execFile() with array args instead.',
    },
    {
      object: 'child_process',
      property: 'execSync',
      message:
        'UNSAFE: execSync() enables shell injection. Use execFileSync() with array args instead.',
    },
    {
      object: 'eval',
      message: 'eval() is dangerous and should never be used',
    },
  ],

  // Enforce secure patterns via restricted syntax
  'no-restricted-syntax': [
    'error',
    {
      selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
      message: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive randomness',
    },
    {
      // Detect { shell: true } in spawn options
      selector: 'ObjectExpression:has(Property[key.name="shell"][value.value=true])',
      message:
        'SECURITY: { shell: true } enables command injection. Use spawn/execFile with array args instead.',
    },
    {
      // Detect template literals in execSync/exec calls (likely injection)
      selector: 'CallExpression[callee.property.name=/^exec(Sync)?$/] > TemplateLiteral',
      message:
        'SECURITY: Template literals in exec() create injection risk. Use execFile() with array args.',
    },
  ],
};

// TypeScript type safety rules
const typeSafetyRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
};

export default [
  // Base security rules for all TypeScript/JavaScript files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    rules: {
      ...baseSecurityRules,
    },
  },

  // Command injection prevention for source files
  {
    files: [
      'server/**/*.ts',
      'server/**/*.js',
      'client/**/*.ts',
      'client/**/*.tsx',
      'shared/**/*.ts',
    ],
    rules: {
      ...commandInjectionRules,
    },
  },

  // Stricter rules for security-sensitive files
  {
    files: [
      '**/auth/**/*.ts',
      '**/auth/**/*.tsx',
      '**/security/**/*.ts',
      '**/security/**/*.tsx',
      '**/api/**/*.ts',
      '**/api/**/*.tsx',
      '**/routes/**/*.ts',
      '**/routes/**/*.tsx',
    ],
    plugins: tsPlugin,
    rules: {
      ...typeSafetyRules,
      '@typescript-eslint/no-explicit-any': 'error', // Stricter for security-sensitive
      'no-console': 'error',
    },
  },
  {
    files: ['**/auth/**/*.js', '**/security/**/*.js', '**/api/**/*.js', '**/routes/**/*.js'],
    rules: {
      'no-console': 'error',
    },
  },

  // Allow console in scripts and tools
  {
    files: [
      'scripts/**/*.ts',
      'scripts/**/*.js',
      'scripts/**/*.mjs',
      'tools/**/*.ts',
      'tools/**/*.js',
      'tools/**/*.mjs',
    ],
    rules: {
      'no-console': 'off',
      // Scripts may need child_process for legitimate automation
      'no-restricted-imports': 'off',
    },
  },

  // Test files can use any for mocking
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.spec.js',
      '**/*.spec.jsx',
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'tests/**/*.js',
      'tests/**/*.jsx',
    ],
    plugins: tsPlugin,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
];
