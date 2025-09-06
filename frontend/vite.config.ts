import { defineConfig, loadEnv } from 'vite';
import deno from '@deno/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { resolve } from 'node:path';
import process from 'node:process';

// https://vite.dev/config/
export default defineConfig(({ mode }: { mode: string }) => {
    // Load env file based on mode
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [deno(), react(), tanstackRouter({
            addExtensions: true
        })],

        resolve: {
            alias: {
                '@': resolve(__dirname, './src'),
                '@components': resolve(__dirname, './src/components'),
                '@utils': resolve(__dirname, './src/utils'),
                '@hooks': resolve(__dirname, './src/hooks'),
                '@types': resolve(__dirname, './src/types'),
                '@assets': resolve(__dirname, './src/assets'),
            },
        },

        server: {
            proxy: {
                '/api': {
                    target: env.VITE_API_URL || 'http://localhost:8090/',
                    // target: 'http://192.168.1.189:8080/',
                    changeOrigin: true,
                    // Optionally remove '/api' prefix when forwarding to the target
                    // rewrite: (path) => path.replace(/^\/api/, ''),
                },
                '/direct': {
                    target: env.VITE_API_URL || 'http://localhost:8090/',
                    changeOrigin: true,
                    // rewrite: (path) => path.replace(/^\/direct/, ''),
                },
                // '/brackets': {
                //   target: 'http://localhost:8000/',
                //   changeOrigin: true,
                //   rewrite: (path) => path.replace(/^\/brackets/, '')
                // }
            },
        },

        build: {
            sourcemap: true,
            outDir: '../backend/static',
            // Optimize chunks
            rollupOptions: {
                output: {
                    manualChunks: {
                        vendor: ['react', 'react-dom', 'jotai'],
                        utils: ['axios'],
                    },
                },
            },
            // Optimize minification
            minify: 'esbuild',
        },

        // Enable detailed build analysis in development
        ...(env.VITE_DEV_MODE
            ? {
                build: {
                    reportCompressedSize: true,
                    chunkSizeWarningLimit: 1000,
                },
            }
            : {}),
    };
});
