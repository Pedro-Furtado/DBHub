import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Imports internos do Monaco (montamos um editor enxuto em src/lib/monaco/setup.ts)
      { find: 'monaco-esm', replacement: fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs', import.meta.url)) },
      // O Monaco embute uma cópia antiga do DOMPurify (com falhas de segurança conhecidas):
      // redireciona para a versão corrigida instalada no projeto
      { find: /^\.\/dompurify\/dompurify\.js$/, replacement: 'dompurify' },
    ],
  },
  optimizeDeps: {
    // O Monaco é montado à mão (src/lib/monaco/setup.ts) e o worker vem com ?worker:
    // se o Vite pré-empacotar, o worker perde o export default e o SQL Editor quebra
    exclude: ['monaco-esm', 'monaco-editor'],
  },
  server: {
    port: 5173,
    // Em dev, as chamadas para /api vão para o server (pasta /server)
    proxy: {
      '/api': 'http://localhost:3333',
      // Servidor MCP (agentes de IA) — mesma origem do painel também em dev
      '/mcp': 'http://localhost:3333',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('react-router')) return 'router'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('radix-ui') || id.includes('@radix-ui')) return 'radix'
          if (id.includes('lucide-react')) return 'icons'
        },
      },
    },
  },
})
