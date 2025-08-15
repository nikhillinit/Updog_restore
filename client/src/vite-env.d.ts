/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;
  readonly VITE_APP_VERSION: string;
  readonly VITE_GIT_SHA: string;
  readonly VITE_BUILD_TIME: string;
  readonly [key: string]: string | boolean | undefined;
}

// No need to redefine ImportMeta as it's already defined in vite/client
// and it will use the extended ImportMetaEnv type