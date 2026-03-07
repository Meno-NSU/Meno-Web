import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: process.env.BACKEND_URL || 'http://127.0.0.1:9006',
        changeOrigin: true,
      },
    },
  },
})
