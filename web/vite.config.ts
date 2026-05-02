import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
- What it does:
  Configures Vite to build and serve the React dashboard.
- Inputs:
  The React plugin and Vite's default project conventions.
- Outputs:
  A Vite configuration object used by dev, build, and preview scripts.
*/
export default defineConfig({
  plugins: [react()],
})
