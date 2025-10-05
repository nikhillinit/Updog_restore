/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/// <reference types="vite/client" />

// Extend the existing ImportMetaEnv interface instead of redefining it
interface ImportMetaEnv {
  // Base Vite environment variables
  MODE: string;
  BASE_URL: string;
  PROD: boolean;
  DEV: boolean;
  SSR: boolean;

  // Custom app environment variables
  VITE_APP_VERSION: string;
  VITE_GIT_SHA: string;
  VITE_BUILD_TIME: string;
  VITE_ENV: string;
  VITE_NEW_SELECTORS?: string;
  VITE_WIZARD_DEBUG?: string;
  VITE_NEW_IA?: string;
  VITE_ENABLE_SELECTOR_KPIS?: string;
  DEMO_MODE?: string;

  // Support dynamic feature flags
  [key: `VITE_FEATURE_${string}`]: string | undefined;
}
