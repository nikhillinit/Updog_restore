/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: {
    MODE: string;
    BASE_URL: string;
    PROD: boolean;
    DEV: boolean;
    SSR: boolean;
    VITE_APP_VERSION: string;
    VITE_GIT_SHA: string;
    VITE_BUILD_TIME: string;
    [key: string]: string | boolean | undefined;
  };
}