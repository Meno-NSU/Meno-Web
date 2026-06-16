import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
  // svgr lets us import Material Symbols SVGs as React components
  // (`*.svg?react`) so they inherit currentColor and scale like icon fonts.
  plugins: [react(), svgr()],
  server: {
    proxy: {
      '/v1': {
        target: process.env.BACKEND_URL || 'http://127.0.0.1:9006',
        changeOrigin: true,
      },
    },
  },
})
