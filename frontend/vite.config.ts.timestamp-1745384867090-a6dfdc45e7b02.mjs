// vite.config.ts
import {
    defineConfig,
    loadEnv,
} from 'file:///home/roberto/projects/drone-dashboard/frontend/node_modules/.deno/vite@6.0.7/node_modules/vite/dist/node/index.js';
import deno from 'file:///home/roberto/projects/drone-dashboard/frontend/node_modules/.deno/@deno+vite-plugin@1.0.2/node_modules/@deno/vite-plugin/dist/index.js';
import react from 'file:///home/roberto/projects/drone-dashboard/frontend/node_modules/.deno/@vitejs+plugin-react-swc@3.7.2/node_modules/@vitejs/plugin-react-swc/index.mjs';
import { resolve } from 'node:path';
var __vite_injected_original_dirname = '/home/roberto/projects/drone-dashboard/frontend';
var vite_config_default = defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [deno(), react()],
        resolve: {
            alias: {
                '@': resolve(__vite_injected_original_dirname, './src'),
                '@components': resolve(__vite_injected_original_dirname, './src/components'),
                '@utils': resolve(__vite_injected_original_dirname, './src/utils'),
                '@hooks': resolve(__vite_injected_original_dirname, './src/hooks'),
                '@types': resolve(__vite_injected_original_dirname, './src/types'),
                '@assets': resolve(__vite_injected_original_dirname, './src/assets'),
            },
        },
        server: {
            proxy: {
                '/api': {
                    target: env.VITE_API_URL || 'http://localhost:8000/',
                    // target: 'http://192.168.1.189:8080/',
                    changeOrigin: true,
                    // Optionally remove '/api' prefix when forwarding to the target
                    rewrite: (path) => path.replace(/^\/api/, ''),
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
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: !env.VITE_DEV_MODE,
                    drop_debugger: !env.VITE_DEV_MODE,
                },
            },
        },
        // Enable detailed build analysis in development
        ...env.VITE_DEV_MODE
            ? {
                build: {
                    reportCompressedSize: true,
                    chunkSizeWarningLimit: 1e3,
                },
            }
            : {},
    };
});
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlUm9vdCI6ICIvaG9tZS9yb2JlcnRvL3Byb2plY3RzL2Ryb25lLWRhc2hib2FyZC9mcm9udGVuZC8iLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9ob21lL3JvYmVydG8vcHJvamVjdHMvZHJvbmUtZGFzaGJvYXJkL2Zyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9yb2JlcnRvL3Byb2plY3RzL2Ryb25lLWRhc2hib2FyZC9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9yb2JlcnRvL3Byb2plY3RzL2Ryb25lLWRhc2hib2FyZC9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IGRlbm8gZnJvbSAnQGRlbm8vdml0ZS1wbHVnaW4nO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0LXN3Yyc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJztcblxuLy8gaHR0cHM6Ly92aXRlLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XG4gICAgLy8gTG9hZCBlbnYgZmlsZSBiYXNlZCBvbiBtb2RlXG4gICAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpLCAnJyk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBwbHVnaW5zOiBbZGVubygpLCByZWFjdCgpXSxcblxuICAgICAgICByZXNvbHZlOiB7XG4gICAgICAgICAgICBhbGlhczoge1xuICAgICAgICAgICAgICAgICdAJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgICAgICAgICAgICAgICdAY29tcG9uZW50cyc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvY29tcG9uZW50cycpLFxuICAgICAgICAgICAgICAgICdAdXRpbHMnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjL3V0aWxzJyksXG4gICAgICAgICAgICAgICAgJ0Bob29rcyc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMvaG9va3MnKSxcbiAgICAgICAgICAgICAgICAnQHR5cGVzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy90eXBlcycpLFxuICAgICAgICAgICAgICAgICdAYXNzZXRzJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYy9hc3NldHMnKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG5cbiAgICAgICAgc2VydmVyOiB7XG4gICAgICAgICAgICBwcm94eToge1xuICAgICAgICAgICAgICAgICcvYXBpJzoge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IGVudi5WSVRFX0FQSV9VUkwgfHwgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMC8nLFxuICAgICAgICAgICAgICAgICAgICAvLyB0YXJnZXQ6ICdodHRwOi8vMTkyLjE2OC4xLjE4OTo4MDgwLycsXG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgLy8gT3B0aW9uYWxseSByZW1vdmUgJy9hcGknIHByZWZpeCB3aGVuIGZvcndhcmRpbmcgdG8gdGhlIHRhcmdldFxuICAgICAgICAgICAgICAgICAgICByZXdyaXRlOiAocGF0aCkgPT4gcGF0aC5yZXBsYWNlKC9eXFwvYXBpLywgJycpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgLy8gJy9icmFja2V0cyc6IHtcbiAgICAgICAgICAgICAgICAvLyAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMC8nLFxuICAgICAgICAgICAgICAgIC8vICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgICAgICAgIC8vICAgcmV3cml0ZTogKHBhdGgpID0+IHBhdGgucmVwbGFjZSgvXlxcL2JyYWNrZXRzLywgJycpXG4gICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSxcblxuICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgc291cmNlbWFwOiB0cnVlLFxuICAgICAgICAgICAgb3V0RGlyOiAnLi4vYmFja2VuZC9zdGF0aWMnLFxuICAgICAgICAgICAgLy8gT3B0aW1pemUgY2h1bmtzXG4gICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgb3V0cHV0OiB7XG4gICAgICAgICAgICAgICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmVuZG9yOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdqb3RhaSddLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXRpbHM6IFsnYXhpb3MnXSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIE9wdGltaXplIG1pbmlmaWNhdGlvblxuICAgICAgICAgICAgbWluaWZ5OiAndGVyc2VyJyxcbiAgICAgICAgICAgIHRlcnNlck9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICBjb21wcmVzczoge1xuICAgICAgICAgICAgICAgICAgICBkcm9wX2NvbnNvbGU6ICFlbnYuVklURV9ERVZfTU9ERSxcbiAgICAgICAgICAgICAgICAgICAgZHJvcF9kZWJ1Z2dlcjogIWVudi5WSVRFX0RFVl9NT0RFLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIEVuYWJsZSBkZXRhaWxlZCBidWlsZCBhbmFseXNpcyBpbiBkZXZlbG9wbWVudFxuICAgICAgICAuLi4oZW52LlZJVEVfREVWX01PREVcbiAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlcG9ydENvbXByZXNzZWRTaXplOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDEwMDAsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDoge30pLFxuICAgIH07XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1QsU0FBUyxjQUFjLGVBQWU7QUFDclcsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFIeEIsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFFdEMsUUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksR0FBRyxFQUFFO0FBRTNDLFNBQU87QUFBQSxJQUNILFNBQVMsQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDO0FBQUEsSUFFekIsU0FBUztBQUFBLE1BQ0wsT0FBTztBQUFBLFFBQ0gsS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxRQUMvQixlQUFlLFFBQVEsa0NBQVcsa0JBQWtCO0FBQUEsUUFDcEQsVUFBVSxRQUFRLGtDQUFXLGFBQWE7QUFBQSxRQUMxQyxVQUFVLFFBQVEsa0NBQVcsYUFBYTtBQUFBLFFBQzFDLFVBQVUsUUFBUSxrQ0FBVyxhQUFhO0FBQUEsUUFDMUMsV0FBVyxRQUFRLGtDQUFXLGNBQWM7QUFBQSxNQUNoRDtBQUFBLElBQ0o7QUFBQSxJQUVBLFFBQVE7QUFBQSxNQUNKLE9BQU87QUFBQSxRQUNILFFBQVE7QUFBQSxVQUNKLFFBQVEsSUFBSSxnQkFBZ0I7QUFBQTtBQUFBLFVBRTVCLGNBQWM7QUFBQTtBQUFBLFVBRWQsU0FBUyxDQUFDLFNBQVMsS0FBSyxRQUFRLFVBQVUsRUFBRTtBQUFBLFFBQ2hEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BTUo7QUFBQSxJQUNKO0FBQUEsSUFFQSxPQUFPO0FBQUEsTUFDSCxXQUFXO0FBQUEsTUFDWCxRQUFRO0FBQUE7QUFBQSxNQUVSLGVBQWU7QUFBQSxRQUNYLFFBQVE7QUFBQSxVQUNKLGNBQWM7QUFBQSxZQUNWLFFBQVEsQ0FBQyxTQUFTLGFBQWEsT0FBTztBQUFBLFlBQ3RDLE9BQU8sQ0FBQyxPQUFPO0FBQUEsVUFDbkI7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBO0FBQUEsTUFFQSxRQUFRO0FBQUEsTUFDUixlQUFlO0FBQUEsUUFDWCxVQUFVO0FBQUEsVUFDTixjQUFjLENBQUMsSUFBSTtBQUFBLFVBQ25CLGVBQWUsQ0FBQyxJQUFJO0FBQUEsUUFDeEI7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUFBO0FBQUEsSUFHQSxHQUFJLElBQUksZ0JBQ0Y7QUFBQSxNQUNFLE9BQU87QUFBQSxRQUNILHNCQUFzQjtBQUFBLFFBQ3RCLHVCQUF1QjtBQUFBLE1BQzNCO0FBQUEsSUFDSixJQUNFLENBQUM7QUFBQSxFQUNYO0FBQ0osQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
