import { defineConfig } from 'drizzle-kit'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { loadEnvFile } from 'node:process'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const databasePath = process.env.KITER_DB_PATH

if (process.argv.includes('studio')) {
  if (!databasePath || !isAbsolute(databasePath)) {
    throw new Error(
      'Set KITER_DB_PATH in .env to the absolute path of your SQLite database before starting Drizzle Studio.',
    )
  }
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema/index.ts',
  out: './drizzle',
  ...(databasePath ? { dbCredentials: { url: databasePath } } : {}),
})
