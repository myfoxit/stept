/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUILD_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
