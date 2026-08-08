/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Origin serving the prebuilt corpus artifacts. Leave unset to serve them
   * from public/corpus during local development.
   */
  readonly VITE_CORPUS_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
