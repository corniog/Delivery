import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  plugins: [
    react(),
    // Dirección pública para la imagen al compartir el link (cámbiala con la variable VITE_SITE_URL)
    { name: 'og-site', transformIndexHtml: (h) => h.replace(/__SITE__/g, (process.env.VITE_SITE_URL || 'https://app.atlanthes.cl').replace(/\/+$/, '')) },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: process.env.VITE_APP_NAME || 'App Negocio',
        short_name: (process.env.VITE_APP_NAME || 'Negocio').slice(0, 12),
        description: 'Inventario, ventas y delivery',
        theme_color: '#4f46e5',
        background_color: '#f6f7fb',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { navigateFallback: 'index.html' }
    })
  ]
});
