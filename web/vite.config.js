import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, /api y /data van al backend local (desde la raíz del repo: npx wrangler dev),
// así `npm run dev` funciona con datos reales, contraseña incluida.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/data': 'http://localhost:8787',
    },
  },
})
