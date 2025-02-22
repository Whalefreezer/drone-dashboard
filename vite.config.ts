import { defineConfig } from 'vite'
import deno from '@deno/vite-plugin'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [deno(), react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000/',
        // target: 'http://192.168.1.189:8080/',
        changeOrigin: true,
        // Optionally remove '/api' prefix when forwarding to the target
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      // '/brackets': {
      //   target: 'http://localhost:8000/',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/brackets/, '')
      // }
    }
  }
})
