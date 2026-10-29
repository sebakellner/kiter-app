import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../runtime/connection.ts'
import { packs } from '../../schema/packs.ts'
import { samples, sampleSources } from '../../schema/samples.ts'

/** Display label for a classification target, or null when it cannot be named.
 *
 * A Sample shows its user-facing display name and otherwise its source file name;
 * this mirrors the rule `preparation.ts` applies when it answers `sampleName`, so
 * the surface never has to explain two different names for the same Sample. A Pack
 * shows its own name.
 */
export function readClassificationTargetLabel(
  db: AppDatabase,
  target: { kind: 'sample' | 'pack'; id: string },
): string | null {
  if (target.kind === 'pack') {
    const pack = db
      .select({ name: packs.name })
      .from(packs)
      .where(eq(packs.id, target.id))
      .get()
    return pack?.name ?? null
  }
  const sample = db
    .select({
      displayName: samples.displayName,
      canonicalPath: sampleSources.canonicalPath,
    })
    .from(samples)
    .innerJoin(sampleSources, eq(samples.id, sampleSources.sampleId))
    .where(eq(samples.id, target.id))
    .get()
  if (!sample) {
    return null
  }
  const name = sample.displayName ?? sample.canonicalPath.split(/[\\/]/u).pop()
  return name && name.trim().length > 0 ? name : null
}
