import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

// Web-only Vite config (no Electron)
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist-web',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug']
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'pixi': ['pixi.js'],
          'react-vendor': ['react', 'react-dom'],
          'video-processing': ['mediabunny', 'mp4box', '@fix-webm-duration/fix']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 5173,
    open: true
  }
})



