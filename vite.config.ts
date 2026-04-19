import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react';
            if (id.includes('@supabase/')) return 'supabase';
            if (id.includes('socket.io-client')) return 'socket';
            if (id.includes('framer-motion') || id.includes('/motion/')) return 'motion';
            if (id.includes('react-youtube') || id.includes('qrcode.react') || id.includes('canvas-confetti')) return 'media';
            if (id.includes('lucide-react')) return 'icons';
            return undefined;
          },
        },
      },
    },
  };
});
