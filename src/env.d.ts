/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_APIS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
