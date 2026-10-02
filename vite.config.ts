/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const PDF_DATA = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

// pdf.js fetches its cmaps, fonts and image decoders while it reads a file.
// they are copied out of the package into static/pdfjs, which git ignores
function pdfData(): Plugin {
  return {
    name: 'pdf-data',
    // before sveltekit lists the static files, or a first build on a fresh
    // clone leaves them out of the service worker
    config: {
      order: 'pre',
      handler() {
        const from = 'node_modules/pdfjs-dist';
        const version = JSON.parse(readFileSync(`${from}/package.json`, 'utf8')).version;
        const stamp = 'static/pdfjs/version.txt';
        if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) return;
        for (const dir of PDF_DATA) cpSync(`${from}/${dir}`, `static/pdfjs/${dir}`, { recursive: true });
        writeFileSync(stamp, version);
      }
    }
  };
}

export default defineConfig({
  plugins: [pdfData(), tailwindcss(), sveltekit()],
  worker: {
    format: 'es'
  },
  build: {
    // pdf-lib alone is about 540 kB, it only loads for a pdf export
    chunkSizeWarningLimit: 600
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
