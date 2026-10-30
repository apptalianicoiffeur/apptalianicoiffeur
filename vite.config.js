import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration.
// - The React plugin handles JSX/HMR.
// - The build output directory is `dist` which matches the Cloudflare Pages setting.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Keep the bundle a bit leaner by splitting vendor chunks.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/messaging'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
