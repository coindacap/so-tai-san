import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://coindacap.github.io/so-tai-san/
// Local / Vercel root: base = '/'
const base = process.env.VITE_BASE || '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
})
