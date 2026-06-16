import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Rewrite /admin and /admin/ to /admin.html in dev mode */
function adminRewrite(): Plugin {
  return {
    name: 'admin-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/admin' || req.url === '/admin/') {
          req.url = '/admin.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [adminRewrite(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@admin': path.resolve(__dirname, './admin'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
