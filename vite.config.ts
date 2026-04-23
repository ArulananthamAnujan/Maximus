import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'lucide-react', '@tanstack/react-query', 'sonner'],
    exclude: ['jspdf', 'jspdf-autotable', 'recharts', 'papaparse'],
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    reportCompressedSize: false, // speeds up build
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Supabase — large, rarely changes
          if (id.includes('@supabase')) return 'vendor-supabase';
          // React core
          if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          if (id.includes('/react/')) return 'vendor-react';
          // Heavy admin-only libs — only loaded on admin pages
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('papaparse')) return 'vendor-utils';
          if (id.includes('date-fns')) return 'vendor-utils';
          // Form libs
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) return 'vendor-form';
          // React Query
          if (id.includes('@tanstack')) return 'vendor-query';
          // Small UI utilities — bundle together
          if (id.includes('sonner') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-ui';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
