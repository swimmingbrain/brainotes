/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  worker: {
    format: 'es'
  },
  server: {
    watch: {
      // pdfs and notebooks people keep next to the checkout must not trigger reloads
      ignored: ['**/*.pdf', '**/*.png', '**/*.jpg', '**/*.brainotes']
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
