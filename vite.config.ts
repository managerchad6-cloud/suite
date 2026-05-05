import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  server: { port: 5291 },
  resolve: {
    alias: {
      '@mf': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
})
