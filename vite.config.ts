import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // The dev server forwards /functions to whichever Supabase project .env points at
  // (this used to be hard-coded to one project).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseUrl = env.VITE_SUPABASE_URL;

  return {
  plugins: [react()],
  server: {
    proxy: supabaseUrl
      ? { '/functions': { target: supabaseUrl, changeOrigin: true, secure: true } }
      : undefined,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'lucide-react'],
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-utils': ['date-fns', 'papaparse'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-form': ['react-hook-form', 'zod', '@hookform/resolvers'],
          'vendor-ui': ['sonner', 'clsx', 'tailwind-merge'],
          'vendor-ai': ['react-player'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
};
});
