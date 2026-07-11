import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.js'],
  },
  build: {
    target: 'node20',
    lib: {
      entry: resolve(__dirname, 'src/extension.ts'),
      formats: ['cjs'],
      fileName: () => 'extension.cjs',
    },
    rollupOptions: {
      // The 'vscode' module is provided by the extension host at runtime.
      external: ['vscode'],
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
    outDir: 'dist',
    minify: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
