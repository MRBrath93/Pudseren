import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    // Testene deler én testdatabase, så filerne køres én ad gangen.
    fileParallelism: false,
  },
});
