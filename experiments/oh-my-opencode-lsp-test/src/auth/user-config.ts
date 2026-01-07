// Test file for LSP rename refactoring
// Task: Rename 'userConfig' to 'configuration' across all files

export interface UserConfig {
  apiKey: string;
  timeout: number;
  retryAttempts: number;
}

export class ConfigManager {
  private userConfig: UserConfig;

  constructor(userConfig: UserConfig) {
    this.userConfig = userConfig;
  }

  getApiKey(): string {
    return this.userConfig.apiKey;
  }

  getTimeout(): number {
    return this.userConfig.timeout;
  }

  updateConfig(newConfig: Partial<UserConfig>): void {
    this.userConfig = { ...this.userConfig, ...newConfig };
  }

  validateConfig(): boolean {
    if (!this.userConfig.apiKey) {
      throw new Error('API key is required in userConfig');
    }
    if (this.userConfig.timeout < 1000) {
      throw new Error('Timeout in userConfig must be >= 1000ms');
    }
    return true;
  }
}
