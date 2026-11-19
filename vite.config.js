import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site from /asad-library-portal/, so every file
// path in the built site has to start with that.
export default defineConfig({
  plugins: [react()],
  base: '/asad-library-portal/',
})
