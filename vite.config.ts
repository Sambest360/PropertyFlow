import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

function isChartsChunk(id: string): boolean {
  return (
    /node_modules\/recharts(\/|$)/.test(id) ||
    /node_modules\/victory-vendor(\/|$)/.test(id) ||
    /node_modules\/d3(-[a-z0-9-]+)?(\/|$)/.test(id)
  )
}

function isLocalSupabaseConfigured(env: Record<string, string>): boolean {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  if (!url || !key) return false
  if (url.includes('YOUR_PROJECT_REF') || key.includes('YOUR_KEY')) return false
  return /supabase\.co/i.test(url)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const uploadMaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT,
  )
  const apiEnabled =
    env.VITE_ENABLE_API === '1' ||
    env.VITE_ENABLE_API === 'true' ||
    (mode === 'development' && isLocalSupabaseConfigured(env)) ||
    (mode === 'production' && env.VITE_ENABLE_API !== '0')

  return {
    define: {
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(env.VERCEL_GIT_COMMIT_SHA || ''),
      'import.meta.env.VITE_SENTRY_ENVIRONMENT': JSON.stringify(env.VERCEL_ENV || mode),
    },
    plugins: [
      react(),
      tailwindcss(),
      ...(uploadMaps
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              release: { name: env.VERCEL_GIT_COMMIT_SHA || undefined },
              sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
              telemetry: false,
            }),
          ]
        : []),
    ],
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
      sourcemap: uploadMaps ? 'hidden' : false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/clsx/')
            ) {
              return 'vendor'
            }
            if (isChartsChunk(id)) return 'charts'
            // PDF writer (pdf-lib + fonts + pako): leases, inspections, owner statements only.
            if (/node_modules\/(@pdf-lib|pdf-lib|pako)\//.test(id)) return 'pdf'
            // Leaflet only loads with map pages; the app shell's Maps JS loader
            // (@react-google-maps) gets its own chunk so it does not drag Leaflet in.
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
              return 'maps'
            }
            if (id.includes('node_modules/@react-google-maps')) return 'gmaps'
            return undefined
          },
        },
      },
    },
  }
})
