import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️  Replace YOUR_GITHUB_USERNAME with your actual GitHub username
export default defineConfig({
  plugins: [react()],
  base: '/wildfit/',
})
