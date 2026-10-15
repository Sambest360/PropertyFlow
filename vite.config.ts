import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function isLocalSupabaseConfigured(env: Record<string, string>): boolean {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  if (!url || !key) return false
  if (url.includes('YOUR_PROJECT_REF') || key.includes('YOUR_KEY')) return false
  return /supabase\.co/i.test(url)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiEnabled =
    env.VITE_ENABLE_API === '1' ||
    env.VITE_ENABLE_API === 'true' ||
    (mode === 'development' && isLocalSupabaseConfigured(env)) ||
    (mode === 'production' && env.VITE_ENABLE_API !== '0')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      warmup: {
        clientFiles: [
          './index.html',
          './src/main.tsx',
          './src/App.tsx',
          './src/index.css',
        ],
      },
      watch: {
        ignored: [
          '**/.agents/**',
          '**/.git/**',
          '**/database/**',
          '**/dist/**',
          '**/docs/**',
          '**/scripts/**',
          '**/server/**',
          '**/supabase/**',
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
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'clsx',
        'lucide-react',
        '@supabase/supabase-js',
        '@supabase/ssr',
        'sweetalert2',
      ],
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
