declare interface MockInstance<TArgs extends any[] = any[], TReturn = any> {
  (...args: TArgs): TReturn;
  mockReturnValue(value: TReturn): this;
  mockImplementation(impl: (...args: TArgs) => TReturn): this;
  mockResolvedValue?(value: TReturn extends Promise<infer U> ? U : unknown): this;
  mockRejectedValue?(reason?: unknown): this;
}

declare interface Vi {
  fn<TArgs extends any[] = any[], TReturn = any>(impl?: (...args: TArgs) => TReturn): MockInstance<TArgs, TReturn>;
  mock(moduleName: string, factory: () => unknown): void;
  clearAllMocks(): void;
  resetAllMocks(): void;
  restoreAllMocks(): void;
}

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => unknown | Promise<unknown>): void;
declare function beforeEach(fn: () => unknown | Promise<unknown>): void;

declare function expect(actual: unknown): {
  toBe(value: unknown): void;
  toEqual(value: unknown): void;
  toBeGreaterThanOrEqual(value: number): void;
  toHaveLength(length: number): void;
  toBeInTheDocument(): void;
  not: {
    toBeInTheDocument(): void;
  };
};

declare module 'vitest' {
  export { describe, it, beforeEach, expect };
  export const vi: Vi;
}

declare module 'vitest/client' {
  export interface TestMetadata {
    name: string;
    suiteName: string;
  }
}
