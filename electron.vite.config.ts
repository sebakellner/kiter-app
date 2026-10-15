import { resolve } from 'path'
import { cpSync } from 'node:fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [
      {
        name: 'database-migration-assets',
        writeBundle(options) {
          if (!options.dir) {
            throw new Error('Missing main build output directory')
          }
          cpSync(resolve('drizzle'), resolve(options.dir, 'migrations'), {
            recursive: true,
          })
        },
      },
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          dbWorker: resolve('src/main/db/worker.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
})
