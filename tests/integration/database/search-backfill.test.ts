import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDatabase } from '../../../src/main/db/runtime/connection.ts'
import { migrationsFolder } from '../../support/database/connection.ts'
import { listCatalogSamples } from '../../../src/main/db/operations/samples/catalog.ts'

// Builds the migration set an installed version predates the search columns with,
// so the upgrade path is exercised instead of the fresh baseline.
async function migrationsBeforeSearchColumns(
  directory: string,
): Promise<string> {
  const folder = path.join(directory, 'migrations-before-search')
  await cp(migrationsFolder, folder, { recursive: true })
  const journalFile = path.join(folder, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalFile, 'utf8')) as {
    entries: { tag: string }[]
  }
  const dropped = journal.entries.at(-1)
  assert.ok(dropped, 'the migration set has at least one entry')
  journal.entries.pop()
  await writeFile(journalFile, JSON.stringify(journal))
  await rm(path.join(folder, `${dropped.tag}.sql`), { force: true })
  return folder
}

test('upgrading an existing catalog backfills the search columns for every Sample', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kiter-search-backfill-'))
  const filename = path.join(directory, 'catalog.sqlite')
  const root = path.join(directory, 'Samples')
  const canonicalPath = path.join(root, 'Percusión', 'Kíck_808.WAV')
  const renamedPath = path.join(root, 'Café', 'Open Hat.wav')

  try {
    const legacy = await migrationsBeforeSearchColumns(directory)
    const before = openDatabase(filename, legacy)
    try {
      // Raw inserts: the previous schema has no search columns to write.
      before.native
        .prepare(
          "INSERT INTO source_roots(id, canonical_path, registered) VALUES ('root', ?, 1)",
        )
        .run(root)
      for (const [id, file] of [
        ['original', canonicalPath],
        ['renamed', renamedPath],
      ] as const) {
        before.native
          .prepare('INSERT INTO samples(id, display_name) VALUES (?, ?)')
          .run(id, id === 'renamed' ? 'Warm Hit' : null)
        before.native
          .prepare(
            "INSERT INTO sample_sources(sample_id, canonical_path, availability, last_checked_at) VALUES (?, ?, 'available', '2026-01-01T00:00:00.000Z')",
          )
          .run(id, file)
        before.native
          .prepare(
            'INSERT INTO source_root_samples(source_root_id, sample_id, present) VALUES (?, ?, 1)',
          )
          .run('root', id)
      }
    } finally {
      before.close()
    }

    const upgraded = openDatabase(filename, migrationsFolder)
    try {
      assert.deepEqual(
        upgraded.native
          .prepare(
            'SELECT sample_id, search_filename FROM sample_sources ORDER BY sample_id',
          )
          .all(),
        [
          { sample_id: 'original', search_filename: 'kick_808.wav' },
          { sample_id: 'renamed', search_filename: 'open hat.wav' },
        ],
      )
      assert.deepEqual(
        upgraded.native
          .prepare(
            'SELECT sample_id, search_relative_path FROM source_root_samples ORDER BY sample_id',
          )
          .all(),
        [
          {
            sample_id: 'original',
            // Normalized search values always use forward slashes.
            search_relative_path: 'percusion/kick_808.wav',
          },
          {
            sample_id: 'renamed',
            search_relative_path: 'cafe/open hat.wav',
          },
        ],
      )
      assert.deepEqual(
        upgraded.native
          .prepare('SELECT id, search_name FROM samples ORDER BY id')
          .all(),
        [
          { id: 'original', search_name: 'kick_808.wav' },
          { id: 'renamed', search_name: 'warm hit' },
        ],
      )

      const find = (search: string): string[] =>
        listCatalogSamples(upgraded.db, { search }).items.map((item) => item.id)
      assert.deepEqual(find('percusión'), ['original'])
      assert.deepEqual(find('warm hit'), ['renamed'])
      assert.deepEqual(find('cafe'), ['renamed'])
      assert.deepEqual(find('kíck'), ['original'])
    } finally {
      upgraded.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
