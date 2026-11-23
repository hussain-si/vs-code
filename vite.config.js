import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The Monaco editor itself is loaded from a CDN at runtime; the remaining
    // bundle (React + Supabase) is a single ~600 kB chunk, which is fine here.
    chunkSizeWarningLimit: 1500,
  },
})
