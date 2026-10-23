import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward API calls to the FastAPI server so the
    // frontend can use relative `/api/...` URLs everywhere.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
