import type { TestContext } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../../../src/main/db/runtime/connection.ts'
import { createTemporaryDirectory } from '../filesystem/temporary-directory.ts'

export const migrationsFolder = fileURLToPath(
  new URL('../../../drizzle', import.meta.url),
)

export function openTestDatabase(
  filename = ':memory:',
  folder = migrationsFolder,
): ReturnType<typeof openDatabase> {
  return openDatabase(filename, folder)
}

export function createMemoryDatabase(
  t: TestContext,
): ReturnType<typeof openDatabase> {
  const connection = openTestDatabase()
  t.after(connection.close)
  return connection
}

export async function createDiskDatabase(t: TestContext): Promise<{
  directory: string
  filename: string
  connection: ReturnType<typeof openDatabase>
  reopen: () => ReturnType<typeof openDatabase>
}> {
  const directory = await createTemporaryDirectory(t, 'database')
  const filename = path.join(directory.path, 'catalog.sqlite')
  let connection = openTestDatabase(filename)
  directory.beforeRemove(() => {
    if (connection.native.open) {
      connection.close()
    }
  })
  return {
    directory: directory.path,
    filename,
    get connection() {
      return connection
    },
    reopen() {
      if (connection.native.open) {
        connection.close()
      }
      connection = openTestDatabase(filename)
      return connection
    },
  }
}
