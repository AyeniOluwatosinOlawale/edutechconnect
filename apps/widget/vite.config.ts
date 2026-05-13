import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'EduChat',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    minify: 'terser',
    target: 'es2017',
    sourcemap: false,
  },
  define: {
    __SUPABASE_URL__: JSON.stringify(process.env.VITE_WIDGET_SUPABASE_URL ?? ''),
    __SUPABASE_ANON_KEY__: JSON.stringify(process.env.VITE_WIDGET_SUPABASE_ANON_KEY ?? ''),
    __FUNCTIONS_URL__: JSON.stringify(process.env.VITE_WIDGET_FUNCTIONS_URL ?? ''),
  },
})
