import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

const QUIZ_LOGGER = 'http://localhost:3015'
const STUDIO    = 'http://localhost:3016'
const GENERATOR = 'http://93.127.214.75:8000'
const RANKING   = 'http://93.127.214.75:3007'
const CHAT      = 'http://94.130.36.242:3002'
const ANIM      = 'http://94.130.36.242:3003'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5291,
    proxy: {
'/api/quiz-log':  { target: QUIZ_LOGGER, changeOrigin: true },
      '/profiles':     { target: QUIZ_LOGGER, changeOrigin: true },
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
      '/ws/orchestrator': { target: 'ws://94.130.36.242:3003', ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@mf': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
