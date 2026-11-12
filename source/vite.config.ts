import { defineConfig } from 'vite'

export default defineConfig({
  // относительные пути: сайт работает и на своём домене, и в подпапке GitHub Pages
  base: './',
  server: { port: 5174, strictPort: true },
  preview: { port: 4174 },
})
