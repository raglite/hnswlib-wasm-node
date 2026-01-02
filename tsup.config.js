import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.js'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
});

