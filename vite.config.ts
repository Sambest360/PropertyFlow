import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiEnabled = env.VITE_ENABLE_API === '1' || env.VITE_ENABLE_API === 'true' ||
    (mode === 'production' && env.VITE_ENABLE_API !== '0')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      watch: {
        ignored: [
          '**/.agents/**',
          '**/database/**',
          '**/docs/**',
          '**/scripts/**',
          '**/propertyflow/**',
        ],
      },
      ...(apiEnabled
        ? {
            proxy: {
              '/api': {
                target: 'http://127.0.0.1:8787',
                changeOrigin: true,
                timeout: 5_000,
              },
            },
          }
        : {}),
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'clsx', 'lucide-react'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            maps: ['leaflet', 'react-leaflet', '@react-google-maps/api'],
          },
        },
      },
    },
  }
})
