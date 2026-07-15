import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-conexaovirtual.png', 'icon-conexaovirtual.png', 'icon-conexaovirtual-192.png', 'icon-conexaovirtual-512.png'],
      manifest: {
        name: 'Conexão Virtual - Help Desk TI',
        short_name: 'Help Desk',
        description: 'Sistema profissional de Help Desk com QR Code e gestão de ativos',
        theme_color: '#667eea',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-conexaovirtual-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-conexaovirtual-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-conexaovirtual-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{css,ico,png,svg,woff,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            urlPattern: ({ request }) => ['script', 'style', 'worker'].includes(request.destination),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assets-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: /^https:\/\/ispqekzrrufhzdqhjnck\.supabase\.co\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-tooltip'],
          'chart-vendor': ['recharts'],
          'map-vendor': ['leaflet', 'react-leaflet'],
          'pdf-vendor': ['jspdf', 'jspdf-autotable'],
          'qr-vendor': ['qrcode'],
          'supabase': ['@supabase/supabase-js'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js', 'date-fns', '@tanstack/react-query', 'recharts', 'sonner'],
  },
}));
