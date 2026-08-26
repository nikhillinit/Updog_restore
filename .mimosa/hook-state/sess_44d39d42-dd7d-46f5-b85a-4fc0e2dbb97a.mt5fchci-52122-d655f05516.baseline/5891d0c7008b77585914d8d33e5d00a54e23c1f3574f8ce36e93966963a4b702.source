export {};
declare global {
  // Optional test-only hooks your app can publish:
  var __resetInflight: undefined | (() => void | Promise<void>);
  var __resetCaches: undefined | (() => void | Promise<void>);
  var __registerTestReset: undefined | ((fn: () => void | Promise<void>) => void);

  // Internal guard to avoid installing hooks more than once
  var __testHelpersInstalled: boolean | undefined;
}