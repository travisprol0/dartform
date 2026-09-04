/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDFLARE_BEACON_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
