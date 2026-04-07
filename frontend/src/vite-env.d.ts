/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_CLIENT_ID: string;
  readonly VITE_REDIRECT_URI: string;
  readonly VITE_API_ENDPOINT: string;
  readonly VITE_COGNITO_POOL_ID: string;
  readonly VITE_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
