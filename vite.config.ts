import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) return 'scene';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/marked') || id.includes('node_modules/dompurify')) return 'markdown';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788',
      '/uploads': 'http://127.0.0.1:8788',
    },
  },
  plugins: [
    react()
  ],
})
