/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/// <reference types="vite/client" />

// Extend the existing ImportMetaEnv interface instead of redefining it
interface ImportMetaEnv {
  // These are already defined in vite/client, so we don't need to redefine them
  // MODE: string;
  // BASE_URL: string;
  // PROD: boolean;
  // DEV: boolean;
  // SSR: boolean;
  
  // Add our custom environment variables
  VITE_APP_VERSION: string;
  VITE_GIT_SHA: string;
  VITE_BUILD_TIME: string;
}
