import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

/**
 * Duas páginas: o console (index.html) e o app dos clientes AI (app.html, em /app). O app não leva o código das telas
 * do console (D-071). No servidor local e na prévia, os caminhos de /app servem app.html.
 */
function appPage(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url && /^\/app(\/|\?|$)/.test(req.url)) req.url = '/app.html'
    next()
  }
  return {
    name: 'aware-app-page',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), appPage()],
  build: { rollupOptions: { input: { console: page('index.html'), app: page('app.html') } } },
})
