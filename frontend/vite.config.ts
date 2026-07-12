import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "RefillX - Smart Refill Infrastructure",
        short_name: "RefillX",
        description: "IoT-enabled Smart Refill PWA Wallet & Vendor Client",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            // Google Fonts runtime caching
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
              },
            },
          },
          {
            // Firebase SDK / CDN runtime caching
            urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "firebase-sdk-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Queue failed cloud function API write requests (topUp/generateQR) for offline background sync
            urlPattern: /^https:\/\/.*\.cloudfunctions\.net\/.*/i,
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "refillx-failed-write-queue",
                options: {
                  maxRetentionTime: 24 * 60, // retry up to 24 hours
                },
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "vendor-react"
            if (id.includes("firebase")) return "vendor-firebase"
            if (id.includes("recharts") || id.includes("d3")) return "vendor-charts"
            if (id.includes("framer-motion")) return "vendor-motion"
            return "vendor-libs"
          }
        },
      },
    },
  },
})
