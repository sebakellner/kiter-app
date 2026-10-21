import { createHash, randomUUID } from 'node:crypto'
import type { DbClient } from '../../db'
import {
  packOrganizationCatalogPageSchema,
  packOrganizationDraftSchema,
  type PackOrganizationEntry,
  type PackOrganizationDraft,
  type PackOrganizationSelection,
} from '../../../shared/features/imports/pack-organization-schemas.ts'
import { normalizeName } from '../../../shared/domain/classification.ts'
import { DomainValidationError } from '../../../shared/domain/validation.ts'
import { IpcError } from '../../../shared/ipc/result.ts'

export interface PackOrganizationCatalog {
  token: string
  items: PackOrganizationEntry[]
}
export interface PackOrganizationReference {
  preparationId: string
  revision: number
  rootId: string
  organizationToken: string
}
export type PackOrganizations = Record<string, PackOrganizationDraft>
export type OrganizationDatabase = Pick<
  DbClient,
  'readImportPackOrganizationCatalog'
>

export function emptyPackOrganization(): PackOrganizationDraft {
  return { instruments: [], genres: [], authors: [], needsReview: false }
}

export function organizationReference(
  preparationId: string,
  revision: number,
  rootId: string,
  catalog: PackOrganizationCatalog,
): PackOrganizationReference {
  return {
    preparationId,
    revision,
    rootId,
    organizationToken: createHash('sha256')
      .update(
        JSON.stringify([
          'import-pack-organization-v1',
          preparationId,
          revision,
          rootId,
          catalog.token,
        ]),
      )
      .digest('hex'),
  }
}

export async function loadPackOrganizationCatalog(
  database: OrganizationDatabase,
  expectedToken?: string,
): Promise<PackOrganizationCatalog> {
  const items: PackOrganizationEntry[] = []
  let token = expectedToken
  let total: number | undefined
  for (let offset = 0; ; offset += 100) {
    let response: Awaited<
      ReturnType<OrganizationDatabase['readImportPackOrganizationCatalog']>
    >
    try {
      response = await database.readImportPackOrganizationCatalog({
        offset,
        token,
      })
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'STALE_REVIEW' || error.code === 'NOT_FOUND') {
          throw new IpcError(
            'STALE_REVIEW',
            'Pack organization catalog changed. Review current choices.',
          )
        }
        if (error.code === 'INVALID_INPUT') {
          throw new IpcError(
            'INVALID_INPUT',
            'Pack organization catalog exceeds its safety limits.',
          )
        }
      }
      throw error
    }
    const parsed = packOrganizationCatalogPageSchema.safeParse(response)
    if (
      !parsed.success ||
      (token && parsed.data.token !== token) ||
      (total !== undefined && parsed.data.total !== total) ||
      parsed.data.items.length !==
        Math.min(100, Math.max(0, parsed.data.total - offset))
    ) {
      throw new IpcError(
        'PROTOCOL_ERROR',
        'Pack organization catalog pages are incomplete.',
      )
    }
    token = parsed.data.token
    total = parsed.data.total
    items.push(...parsed.data.items)
    if (offset + 100 >= total) {
      break
    }
  }
  if (
    Buffer.byteLength(JSON.stringify(items)) > 8 * 1024 * 1024 ||
    new Set(items.map((item) => `${item.kind}:${item.id}`)).size !==
      items.length
  ) {
    throw new IpcError(
      'PROTOCOL_ERROR',
      'Pack organization catalog is inconsistent or exceeds its safety limit.',
    )
  }
  return { token, items }
}

function sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

function authorsWithName(
  catalog: PackOrganizationCatalog,
  name: string,
): Extract<PackOrganizationEntry, { kind: 'author' }>[] {
  return catalog.items.filter(
    (item): item is Extract<PackOrganizationEntry, { kind: 'author' }> =>
      item.kind === 'author' &&
      normalizeName(item.name) === normalizeName(name),
  )
}

export function stagePackOrganization(
  catalog: PackOrganizationCatalog,
  organizations: PackOrganizations,
  rootId: string,
  selection: PackOrganizationSelection,
): PackOrganizationDraft {
  const select = <K extends 'instrument' | 'genre'>(
    kind: K,
    ids: string[],
  ): Extract<PackOrganizationEntry, { kind: K }>[] =>
    ids.map((id) => {
      const item = catalog.items.find(
        (entry): entry is Extract<PackOrganizationEntry, { kind: K }> =>
          entry.kind === kind && entry.id === id,
      )
      if (!item) {
        throw new IpcError(
          'STALE_REVIEW',
          'A selected Pack classification no longer exists.',
        )
      }
      return { ...item }
    })
  const knownDrafts = new Map(
    Object.values(organizations).flatMap((organization) =>
      organization.authors.flatMap((author) =>
        author.kind === 'new' ? [[author.draftId, author] as const] : [],
      ),
    ),
  )
  const retained = new Map(
    Object.entries(organizations)
      .filter(([id]) => id !== rootId)
      .flatMap(([, organization]) =>
        organization.authors.flatMap((author) =>
          author.kind === 'new' ? [[author.draftId, author] as const] : [],
        ),
      ),
  )
  const authors: PackOrganizationDraft['authors'] = []
  // Include every reused draft in the projected selection before checking new
  // creations, so request ordering cannot hide a pending homonym.
  for (const choice of selection.authors) {
    if (choice.kind === 'new' && choice.draftId) {
      const prior = knownDrafts.get(choice.draftId)
      if (prior) {
        retained.set(prior.draftId, prior)
      }
    }
  }
  const selected = new Set<string>()
  for (const choice of selection.authors) {
    if (choice.kind === 'existing') {
      const author = catalog.items.find(
        (entry) => entry.kind === 'author' && entry.id === choice.id,
      )
      if (!author || selected.has(choice.id)) {
        throw new DomainValidationError(
          'Select each existing Author identity only once.',
        )
      }
      authors.push({ kind: 'existing', id: author.id, name: author.name })
      selected.add(choice.id)
      continue
    }
    const prior = choice.draftId ? knownDrafts.get(choice.draftId) : undefined
    if (choice.draftId && (!prior || prior.name !== choice.name)) {
      throw new DomainValidationError(
        'Reuse an owned Author draft without silently changing its name.',
      )
    }
    const draftId = prior?.draftId ?? randomUUID()
    const matches = authorsWithName(catalog, choice.name)
    const pending = [
      ...retained.values(),
      ...authors.filter((author) => author.kind === 'new'),
    ]
      .filter(
        (author) =>
          author.kind === 'new' &&
          author.draftId !== draftId &&
          normalizeName(author.name) === normalizeName(choice.name),
      )
      .map((author) => author.draftId)
    if (
      selected.has(draftId) ||
      !sameIds(
        choice.acknowledgedAuthorIds,
        matches.map((author) => author.id),
      ) ||
      (!prior && !sameIds(choice.acknowledgedDraftIds, [...new Set(pending)]))
    ) {
      throw new DomainValidationError(
        'Review matching Author identities before explicitly creating a separate credit.',
      )
    }
    selected.add(draftId)
    authors.push({
      kind: 'new',
      draftId,
      name: choice.name,
      acknowledgedAuthors: matches,
      acknowledgedDraftIds:
        prior?.acknowledgedDraftIds ?? choice.acknowledgedDraftIds,
    })
  }
  return packOrganizationDraftSchema.parse({
    instruments: select('instrument', selection.instrumentIds).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    ),
    genres: select('genre', selection.genreIds).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    ),
    authors: authors.sort((a, b) => {
      const one = a.kind === 'existing' ? a.id : a.draftId
      const two = b.kind === 'existing' ? b.id : b.draftId
      return one < two ? -1 : 1
    }),
    needsReview: false,
  })
}

export function changedPackOrganizations(
  catalog: PackOrganizationCatalog,
  organizations: PackOrganizations,
): string[] {
  const changed: string[] = []
  for (const [rootId, draft] of Object.entries(organizations)) {
    const stale =
      [...draft.instruments, ...draft.genres].some(
        (selected) =>
          !catalog.items.some(
            (entry) => JSON.stringify(entry) === JSON.stringify(selected),
          ),
      ) ||
      draft.authors.some((author) =>
        author.kind === 'existing'
          ? !catalog.items.some(
              (entry) =>
                entry.kind === 'author' &&
                entry.id === author.id &&
                entry.name === author.name,
            )
          : JSON.stringify(authorsWithName(catalog, author.name)) !==
            JSON.stringify(author.acknowledgedAuthors),
      )
    if (stale || draft.needsReview) {
      changed.push(rootId)
    }
  }
  return changed
}
