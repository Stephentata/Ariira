import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const localTtsProxy = {
  '/api/ari/tts': {
    target: 'http://127.0.0.1:3901',
    changeOrigin: true,
    timeout: 600_000,
    proxyTimeout: 600_000,
    rewrite: () => '/v1/audio/speech',
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      ...localTtsProxy,
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
    },
  },
  preview: {
    proxy: localTtsProxy,
  },
})
