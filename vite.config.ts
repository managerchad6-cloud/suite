import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

// Dev-server targets: every backend runs locally by default (the old server IPs are gone).
// Override any of them with an env var, e.g. VVC_GENERATOR=http://127.0.0.1:8001 npm run dev
const env = (name: string, fallback: string) => process.env[name] || fallback
const IDENTITY    = env('VVC_IDENTITY', 'http://127.0.0.1:3020')
const QUIZ_LOGGER = env('VVC_QUIZ_LOGGER', 'http://127.0.0.1:3015')   // legacy /comments only
const STUDIO      = env('VVC_STUDIO', 'http://127.0.0.1:3016')
const GENERATOR   = env('VVC_GENERATOR', 'http://127.0.0.1:8000')
const RANKING     = env('VVC_RANKING', 'http://127.0.0.1:3007')
const CHAT        = env('VVC_CHAT', 'http://127.0.0.1:3002')
const ANIM        = env('VVC_ANIM', 'http://127.0.0.1:3003')

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5291,
    proxy: {
      // Identity must keep the browser's Host/Origin: sign-in messages are bound to this site
      '/api/identity': { target: IDENTITY },
      '/comments':     { target: QUIZ_LOGGER, changeOrigin: true },
      '/generate':   { target: GENERATOR, changeOrigin: true },
      '/parse':      { target: GENERATOR, changeOrigin: true },
      '/jobs':       { target: GENERATOR, changeOrigin: true },
      '/leaderboard':{ target: GENERATOR, changeOrigin: true },
      '/memes':      { target: GENERATOR, changeOrigin: true },
      '/publish':    { target: STUDIO,    changeOrigin: true },
      '/handmade':   { target: STUDIO,    changeOrigin: true },
      '/studio':     { target: STUDIO,    changeOrigin: true },
      '/drafts':     { target: STUDIO,    changeOrigin: true },
      '/memebank':   { target: STUDIO,    changeOrigin: true },
      '/api/votes':  { target: STUDIO,    changeOrigin: true },
      '/api/player': { target: STUDIO,    changeOrigin: true },
      '/api/feed':   { target: STUDIO,    changeOrigin: true },
      '/api/notifications': { target: STUDIO, changeOrigin: true },
      '/api/characters':   { target: STUDIO, changeOrigin: true },
      '/api/brackets':     { target: STUDIO, changeOrigin: true },
      '/api/shadow':       { target: STUDIO, changeOrigin: true },
      '/api/comments':     { target: STUDIO, changeOrigin: true },
      '/api/credits':      { target: STUDIO, changeOrigin: true },
      '/internal':         { target: STUDIO, changeOrigin: true },
      '/api/chat':   { target: CHAT,      changeOrigin: true },
      '/api/ranks':  { target: RANKING,   changeOrigin: true },
      '/api/vote':   { target: RANKING,   changeOrigin: true },
      '/api/roadmap':{ target: RANKING,   changeOrigin: true },
      '/api/meme-intake':    { target: ANIM, changeOrigin: true },
      '/api/orchestrator':   { target: ANIM, changeOrigin: true },
      '/api/lists':  { target: ANIM,      changeOrigin: true },
      '/api/suggestions': { target: CHAT,  changeOrigin: true },
      '/api/yt-queue':    { target: ANIM,  changeOrigin: true },
      '/streams':    { target: ANIM,      changeOrigin: true },
      '/ws/orchestrator': { target: ANIM.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@mf': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
