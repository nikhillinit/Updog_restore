/**
 * ESLint Security Configuration
 * Enforces security best practices and prevents common vulnerabilities
 * Updated: 2025 - Command injection prevention
 */

export default {
  rules: {
    // Prevent command injection - use safe wrappers
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: 'child_process',
          message: 'Import from child_process is restricted. Use execFile/execFileSync (not exec/execSync) with array args, or use scripts/lib/git-security.mjs for Git operations.'
        }
      ],
      patterns: [
        {
          group: ['*/child_process'],
          message: 'Import from child_process is restricted. Use execFile/execFileSync (not exec/execSync) with array args, or use scripts/lib/git-security.mjs for Git operations.'
        }
      ]
    }],
    
    // Prevent unsafe property access
    'no-restricted-properties': ['error',
      {
        object: 'child_process',
        property: 'exec',
        message: 'UNSAFE: exec() enables shell injection. Use execFile() with array args instead.'
      },
      {
        object: 'child_process',
        property: 'execSync',
        message: 'UNSAFE: execSync() enables shell injection. Use execFileSync() with array args instead.'
      },
      {
        object: 'eval',
        message: 'eval() is dangerous and should never be used'
      }
    ],
    
    // Prevent dangerous global functions
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // Prevent prototype pollution
    'no-proto': 'error',
    'no-extend-native': 'error',
    
    // Enforce secure patterns
    'no-restricted-syntax': ['error',
      {
        selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
        message: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive randomness'
      },
      {
        selector: 'MemberExpression[object.name="process"][property.name="env"]',
        message: 'Validate environment variables before use'
      },
      {
        // Detect { shell: true } in spawn options
        selector: 'ObjectExpression:has(Property[key.name="shell"][value.value=true])',
        message: 'SECURITY: { shell: true } enables command injection. Use spawn/execFile with array args instead.'
      },
      {
        // Detect template literals in execSync/exec calls (likely injection)
        selector: 'CallExpression[callee.property.name=/^exec(Sync)?$/] > TemplateLiteral',
        message: 'SECURITY: Template literals in exec() create injection risk. Use execFile() with array args.'
      }
    ],
    
    // Security-focused type safety
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    
    // Prevent information disclosure
    'no-console': ['warn', {
      allow: ['warn', 'error']
    }],
    
    // Async/await best practices
    'no-async-promise-executor': 'error',
    'require-atomic-updates': 'error',
    
    // Input validation reminders (custom messages)
    'max-len': ['warn', {
      code: 150,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true
    }],
  },
  
  overrides: [
    {
      // Stricter rules for security-sensitive files
      files: [
        '**/auth/**/*.{ts,js}',
        '**/security/**/*.{ts,js}',
        '**/api/**/*.{ts,js}',
        '**/routes/**/*.{ts,js}'
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        'no-console': 'error',
      }
    },
    {
      // Allow console in scripts and tools
      files: [
        'scripts/**/*.{ts,js,mjs}',
        'tools/**/*.{ts,js,mjs}'
      ],
      rules: {
        'no-console': 'off',
      }
    },
    {
      // Test files can use any for mocking
      files: [
        '**/*.test.{ts,tsx,js,jsx}',
        '**/*.spec.{ts,tsx,js,jsx}',
        'tests/**/*.{ts,tsx,js,jsx}'
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
      }
    }
  ]
};