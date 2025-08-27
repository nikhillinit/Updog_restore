/**
 * BMAD (Build, Measure, Automate, Deploy) Safety Configuration
 * Defines guardrails, limits, and routing rules for AI agents
 */

export const BMAD_CONFIG = {
  // Global limits
  limits: {
    maxPRsPerWeek: 10,
    maxPRsPerDay: 3,
    maxFilesPerPR: 20,
    maxLinesPerPR: 500,
    maxRepairsPerRun: 3,
    confidenceThreshold: 0.6
  },
  
  // Protected paths that require CODEOWNER approval
  protectedPaths: [
    'migrations/',
    'security/',
    'flags/',
    'server/auth/',
    'server/crypto/',
    '.github/workflows/',
    'scripts/deploy*.js',
    'scripts/rollback*.js',
    '*.env',
    '*.key',
    '*.pem',
    'package-lock.json'
  ],
  
  // Safe paths for autonomous operation
  safePaths: [
    'tests/',
    'docs/',
    '*.md',
    'client/src/components/',
    'client/src/pages/',
    'client/src/hooks/',
    '*.test.ts',
    '*.spec.ts',
    '*.test.tsx',
    '*.spec.tsx'
  ],
  
  // Issue classification patterns
  classificationPatterns: {
    syntax: {
      patterns: [
        /SyntaxError/,
        /ParseError/,
        /Unexpected token/,
        /Unterminated/,
        /Missing semicolon/,
        /Expected '.*' but got/
      ],
      confidence: 0.95,
      agent: 'syntax-repair'
    },
    
    typescript: {
      patterns: [
        /TS\d{4}:/,
        /Type '.*' is not assignable/,
        /Property '.*' does not exist/,
        /Cannot find module/,
        /has no exported member/
      ],
      confidence: 0.9,
      agent: 'type-repair'
    },
    
    assertion: {
      patterns: [
        /Expected .* to be/,
        /Expected .* to equal/,
        /AssertionError/,
        /expect\(.*\)/,
        /toBe\(/,
        /toEqual\(/
      ],
      confidence: 0.85,
      agent: 'assertion-repair'
    },
    
    integration: {
      patterns: [
        /Connection refused/,
        /ECONNREFUSED/,
        /Database .* does not exist/,
        /timeout/i,
        /Network error/,
        /fetch failed/
      ],
      confidence: 0.7,
      agent: 'integration-repair'
    },
    
    e2e: {
      patterns: [
        /TimeoutError: Waiting for/,
        /Element not found/,
        /Playwright/,
        /Selector/,
        /Locator/,
        /page\./
      ],
      confidence: 0.75,
      agent: 'e2e-repair'
    },
    
    flaky: {
      patterns: [
        /sometimes/i,
        /intermittent/i,
        /flaky/i,
        /random/i
      ],
      confidence: 0.5,
      agent: 'manual-triage'
    }
  },
  
  // Agent capabilities
  agents: {
    'syntax-repair': {
      maxAttempts: 3,
      timeout: 60000,
      capabilities: ['read', 'edit', 'test'],
      restrictions: ['no-delete', 'no-create']
    },
    
    'type-repair': {
      maxAttempts: 5,
      timeout: 120000,
      capabilities: ['read', 'edit', 'test', 'type-check'],
      restrictions: ['no-delete']
    },
    
    'assertion-repair': {
      maxAttempts: 3,
      timeout: 90000,
      capabilities: ['read', 'edit', 'test'],
      restrictions: ['test-files-only']
    },
    
    'integration-repair': {
      maxAttempts: 2,
      timeout: 180000,
      capabilities: ['read', 'edit', 'test', 'db-check'],
      restrictions: ['no-schema-changes']
    },
    
    'e2e-repair': {
      maxAttempts: 2,
      timeout: 300000,
      capabilities: ['read', 'edit', 'test', 'browser'],
      restrictions: ['selectors-only']
    },
    
    'manual-triage': {
      maxAttempts: 0,
      timeout: 0,
      capabilities: [],
      restrictions: ['human-review-required']
    }
  },
  
  // Metrics configuration
  metrics: {
    enabled: true,
    port: 9091,
    path: '/metrics',
    labels: ['agent', 'issue_type', 'outcome', 'confidence']
  },
  
  // Notification configuration
  notifications: {
    slack: {
      enabled: process.env.SLACK_WEBHOOK_URL ? true : false,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channels: {
        repairs: '#bmad-repairs',
        alerts: '#bmad-alerts',
        weekly: '#engineering'
      }
    },
    
    github: {
      enabled: true,
      labels: {
        autoRepair: 'bmad:auto-repair',
        needsTriage: 'bmad:needs-triage',
        lowConfidence: 'bmad:low-confidence',
        protected: 'bmad:protected-path'
      }
    }
  },
  
  // Weekly report configuration
  weeklyReport: {
    enabled: true,
    dayOfWeek: 1, // Monday
    hour: 9, // 9 AM
    metrics: [
      'total_repairs',
      'success_rate',
      'time_saved_hours',
      'top_issue_types',
      'confidence_distribution',
      'agent_performance'
    ]
  }
};

// Validate configuration on load
export function validateConfig() {
  const errors = [];
  
  if (BMAD_CONFIG.limits.confidenceThreshold < 0 || BMAD_CONFIG.limits.confidenceThreshold > 1) {
    errors.push('Confidence threshold must be between 0 and 1');
  }
  
  if (BMAD_CONFIG.limits.maxPRsPerWeek < BMAD_CONFIG.limits.maxPRsPerDay * 7) {
    errors.push('Weekly PR limit is less than daily limit * 7');
  }
  
  Object.entries(BMAD_CONFIG.agents).forEach(([name, agent]) => {
    if (agent.maxAttempts > 10) {
      errors.push(`Agent ${name} has too many max attempts (${agent.maxAttempts})`);
    }
  });
  
  if (errors.length > 0) {
    console.error('BMAD Configuration Errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  
  return true;
}

// Check if path is protected
export function isProtectedPath(filepath) {
  return BMAD_CONFIG.protectedPaths.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filepath);
    }
    return filepath.startsWith(pattern) || filepath.endsWith(pattern);
  });
}

// Check if path is safe for autonomous operation
export function isSafePath(filepath) {
  return BMAD_CONFIG.safePaths.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filepath);
    }
    return filepath.startsWith(pattern) || filepath.endsWith(pattern);
  });
}

// Classify issue based on error message
export function classifyIssue(errorMessage) {
  let bestMatch = null;
  let highestConfidence = 0;
  
  Object.entries(BMAD_CONFIG.classificationPatterns).forEach(([type, config]) => {
    const matches = config.patterns.filter(pattern => pattern.test(errorMessage));
    if (matches.length > 0) {
      const confidence = config.confidence * (matches.length / config.patterns.length);
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          type,
          agent: config.agent,
          confidence,
          matchedPatterns: matches.length
        };
      }
    }
  });
  
  // Check against confidence threshold
  if (bestMatch && bestMatch.confidence >= BMAD_CONFIG.limits.confidenceThreshold) {
    return bestMatch;
  }
  
  // Default to manual triage for low confidence
  return {
    type: 'unknown',
    agent: 'manual-triage',
    confidence: highestConfidence,
    reason: 'Below confidence threshold'
  };
}

// Get agent configuration
export function getAgentConfig(agentName) {
  return BMAD_CONFIG.agents[agentName] || BMAD_CONFIG.agents['manual-triage'];
}

// Export for testing
export default BMAD_CONFIG;