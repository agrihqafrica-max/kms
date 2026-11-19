import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000',
      '/finance': 'http://127.0.0.1:3000',
      '/inventory': 'http://127.0.0.1:3000',
      '/pos': 'http://127.0.0.1:3000',
      '/radar': 'http://127.0.0.1:3000',
      '/organizations': 'http://127.0.0.1:3000',
    },
  },
})
