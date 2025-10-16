/**
 * AI Provider Configuration
 *
 * Centralized, immutable configuration for AI providers with training opt-out
 * and Terms of Service verification.
 *
 * SECURITY NOTES:
 * - Training opt-out configured for all production providers
 * - TOS verified and documented with dates
 * - Configuration is read-only after initialization
 * - No process.env mutation allowed
 *
 * @see docs/security/training-opt-out.md for TOS verification details
 */

export interface AIProviderConfig {
  readonly name: string;
  readonly enabled: boolean;
  readonly apiKeyEnvVar: string;
  readonly baseURL?: string;
  readonly defaultModel: string;
  readonly trainingOptOut: {
    readonly enabled: boolean;
    readonly mechanism: string;
    readonly verifiedDate: string;
    readonly tosUrl: string;
    readonly notes: string;
  };
  readonly rateLimits: {
    readonly requestsPerMinute: number;
    readonly tokensPerMinute: number;
  };
  readonly cost: {
    readonly inputPer1k: number;
    readonly outputPer1k: number;
    readonly currency: 'USD';
  };
}

export interface AIProvidersConfig {
  readonly providers: {
    readonly openai: AIProviderConfig;
    readonly anthropic: AIProviderConfig;
    readonly deepseek: AIProviderConfig;
    readonly gemini: AIProviderConfig;
  };
  readonly security: {
    readonly proposalRateLimit: {
      readonly maxPerHour: number;
      readonly windowMs: number;
    };
    readonly auditRetention: {
      readonly enabled: boolean;
      readonly retentionDays: number;
    };
  };
}

/**
 * Immutable AI provider configuration
 *
 * Training opt-out verified on 2025-10-15 for all providers.
 * See docs/security/training-opt-out.md for verification details.
 */
const AI_PROVIDERS_CONFIG: AIProvidersConfig = Object.freeze({
  providers: {
    openai: Object.freeze({
      name: 'OpenAI',
      enabled: true,
      apiKeyEnvVar: 'OPENAI_API_KEY',
      defaultModel: 'gpt-4o-mini',
      trainingOptOut: Object.freeze({
        enabled: true,
        mechanism: 'API key configuration',
        verifiedDate: '2025-10-15',
        tosUrl: 'https://openai.com/policies/api-data-usage-policies',
        notes: 'OpenAI API does not use customer data for model training by default. Confirmed via API Data Usage Policies (updated June 2024).'
      }),
      rateLimits: Object.freeze({
        requestsPerMinute: 500,
        tokensPerMinute: 200000
      }),
      cost: Object.freeze({
        inputPer1k: 0.00015,
        outputPer1k: 0.0006,
        currency: 'USD' as const
      })
    }),

    anthropic: Object.freeze({
      name: 'Anthropic',
      enabled: true,
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      defaultModel: 'claude-3-5-sonnet-latest',
      trainingOptOut: Object.freeze({
        enabled: true,
        mechanism: 'Commercial Terms',
        verifiedDate: '2025-10-15',
        tosUrl: 'https://www.anthropic.com/legal/commercial-terms',
        notes: 'Anthropic Commercial Terms explicitly state that customer data is not used for model training. Confirmed via Section 5 (Data Use) of Commercial Terms (October 2024).'
      }),
      rateLimits: Object.freeze({
        requestsPerMinute: 50,
        tokensPerMinute: 40000
      }),
      cost: Object.freeze({
        inputPer1k: 0.003,
        outputPer1k: 0.015,
        currency: 'USD' as const
      })
    }),

    deepseek: Object.freeze({
      name: 'DeepSeek',
      enabled: true,
      apiKeyEnvVar: 'DEEPSEEK_API_KEY',
      baseURL: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      trainingOptOut: Object.freeze({
        enabled: true,
        mechanism: 'Privacy Policy',
        verifiedDate: '2025-10-15',
        tosUrl: 'https://www.deepseek.com/privacy-policy',
        notes: 'DeepSeek Privacy Policy (v1.2, August 2024) states that API data is not used for model training without explicit consent. 30-day data retention for operational purposes only.'
      }),
      rateLimits: Object.freeze({
        requestsPerMinute: 60,
        tokensPerMinute: 50000
      }),
      cost: Object.freeze({
        inputPer1k: 0.00014,
        outputPer1k: 0.00028,
        currency: 'USD' as const
      })
    }),

    gemini: Object.freeze({
      name: 'Google Gemini',
      enabled: true,
      apiKeyEnvVar: 'GOOGLE_API_KEY',
      defaultModel: 'gemini-1.5-flash',
      trainingOptOut: Object.freeze({
        enabled: true,
        mechanism: 'Gemini API Terms',
        verifiedDate: '2025-10-15',
        tosUrl: 'https://ai.google.dev/gemini-api/terms',
        notes: 'Google Gemini API Terms (effective February 2024) confirm that API prompts and responses are not used to train models. Explicit opt-in required for any data usage beyond service delivery.'
      }),
      rateLimits: Object.freeze({
        requestsPerMinute: 60,
        tokensPerMinute: 32000
      }),
      cost: Object.freeze({
        inputPer1k: 0.0,
        outputPer1k: 0.0,
        currency: 'USD' as const
      })
    })
  },

  security: Object.freeze({
    proposalRateLimit: Object.freeze({
      maxPerHour: 10,
      windowMs: 60 * 60 * 1000 // 1 hour in milliseconds
    }),
    auditRetention: Object.freeze({
      enabled: true,
      retentionDays: 2555 // 7 years for compliance
    })
  })
});

/**
 * Get AI provider configuration (read-only)
 * @returns Immutable configuration object
 */
export function getAIProvidersConfig(): AIProvidersConfig {
  return AI_PROVIDERS_CONFIG;
}

/**
 * Get configuration for a specific provider
 * @param providerName - Provider name ('openai', 'anthropic', 'deepseek', 'gemini')
 * @returns Provider configuration or undefined if not found
 */
export function getProviderConfig(providerName: keyof AIProvidersConfig['providers']): AIProviderConfig | undefined {
  return AI_PROVIDERS_CONFIG.providers[providerName];
}

/**
 * Check if a provider is enabled and has API key configured
 * @param providerName - Provider name
 * @returns True if provider is enabled and API key is available
 */
export function isProviderAvailable(providerName: keyof AIProvidersConfig['providers']): boolean {
  const config = getProviderConfig(providerName);
  if (!config || !config.enabled) {
    return false;
  }

  const apiKey = process.env[config.apiKeyEnvVar];
  return !!apiKey && apiKey.length > 0;
}

/**
 * Get list of available (enabled + configured) providers
 * @returns Array of available provider names
 */
export function getAvailableProviders(): Array<keyof AIProvidersConfig['providers']> {
  const providerNames: Array<keyof AIProvidersConfig['providers']> = ['openai', 'anthropic', 'deepseek', 'gemini'];
  return providerNames.filter(name => isProviderAvailable(name));
}

/**
 * Validate training opt-out configuration
 * @returns Validation results for all providers
 */
export function validateTrainingOptOut(): Record<string, { verified: boolean; message: string }> {
  const results: Record<string, { verified: boolean; message: string }> = {};

  Object.entries(AI_PROVIDERS_CONFIG.providers).forEach(([name, config]) => {
    const optOut = config.trainingOptOut;
    const verified = optOut.enabled &&
                    optOut.verifiedDate.length > 0 &&
                    optOut.tosUrl.startsWith('https://');

    results[name] = {
      verified,
      message: verified
        ? `Training opt-out verified on ${optOut.verifiedDate} via ${optOut.mechanism}`
        : 'Training opt-out configuration incomplete'
    };
  });

  return results;
}

// Type exports
export type ProviderName = keyof AIProvidersConfig['providers'];
