import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const API = process.env.API_URL || 'http://127.0.0.1:3000'

// Два приложения: клиентское (/) и для сотрудников (/staff/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': API } },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), staff: resolve(import.meta.dirname, 'staff/index.html') },
    },
  },
})
