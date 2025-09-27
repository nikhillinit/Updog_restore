// Mock for @upstash/redis to prevent import errors in tests
export class Redis {
  constructor(_config: any) {}
  
  async get(_key: string): Promise<any> {
    return null;
  }
  
  async set(_key: string, _value: any, _options?: any): Promise<void> {
    // Mock implementation
  }
  
  async del(_key: string): Promise<number> {
    return 0;
  }
  
  async keys(_pattern: string): Promise<string[]> {
    return [];
  }
  
  async flushdb(): Promise<void> {
    // Mock implementation
  }
}

export default { Redis };