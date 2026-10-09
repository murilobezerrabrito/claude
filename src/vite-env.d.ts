/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do Supabase (no ambiente local, o de `npx supabase status`). */
  readonly VITE_SUPABASE_URL?: string
  /** Chave publicável do Supabase: a única chave que vai para o navegador. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
