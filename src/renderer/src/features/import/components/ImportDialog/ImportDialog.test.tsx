import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type {
  Pack,
  PackImportCandidate,
  PackImportReview,
} from '@shared/domain/pack'
import type { FolderImportOutcome } from '@renderer/features/library/hooks/useLibrary'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import {
  ALREADY_REGISTERED_REASON,
  alreadyImportedStatus,
  ASSIGN_ALL_CONFLICTS,
  assignDecisionAction,
  conflictBlockedReason,
  conflictDecidedStatus,
  conflictOriginNote,
  conflictReadMoreAction,
  conflictSummary,
  KEEP_ALL_CONFLICTS,
  keepDecisionAction,
  PREPARE_CONSEQUENCE_NOTE,
} from '../../copy'
import { IMPORT_CONFLICT_PAGE_SIZE } from '../../hooks/useImportDialog'
import { ImportDialog } from './ImportDialog'

const ALPHA = '/library/alpha-breaks'
const BETA = '/library/beta-hits'
const ALPHA_ROOT = '11111111-1111-4111-8111-111111111111'
const BETA_ROOT = '22222222-2222-4222-8222-222222222222'
const PACK_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PACK_ID = '44444444-4444-4444-8444-444444444444'
const KICK_ID = '55555555-5555-4555-8555-555555555555'
const VOX_ID = '66666666-6666-4666-8666-666666666666'
const TOKEN = 'a'.repeat(64)

// jsdom does not implement the native modal methods the Dialog primitive calls.
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement): void {
      this.removeAttribute('open')
    },
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function review(
  sourceRootId: string,
  overrides: Partial<PackImportReview> = {},
): PackImportReview {
  return {
    sourceRootId,
    pack: null,
    sampleCount: 3,
    conflictCount: 0,
    token: TOKEN,
    ...overrides,
  }
}

function packRecord(name: string, sourceRootId: string): Pack {
  return {
    id: PACK_ID,
    sourceRootId,
    name,
    description: null,
    coverAssetId: null,
  }
}

function candidate(
  values: Partial<PackImportCandidate> & { name: string },
): PackImportCandidate {
  return {
    sampleId: KICK_ID,
    packId: null,
    originAssignment: 'automatic',
    path: `${ALPHA}/${values.name}`,
    conflict: false,
    ...values,
  }
}

// The two conflicting Samples of the alpha folder: one already belongs to
// another Pack, the other is kept as a standalone Sample by hand.
const KICK = candidate({
  sampleId: KICK_ID,
  name: 'kick.wav',
  packId: OTHER_PACK_ID,
  conflict: true,
})
const VOX = candidate({
  sampleId: VOX_ID,
  name: 'vox.wav',
  originAssignment: 'manual',
  conflict: true,
})
const SNARE = candidate({
  sampleId: '77777777-7777-4777-8777-777777777777',
  name: 'snare.wav',
})

// A candidate page holds IMPORT_CONFLICT_PAGE_SIZE Samples, so a fixture that
// spans pages fills one.
function fillerPage(): PackImportCandidate[] {
  return Array.from({ length: IMPORT_CONFLICT_PAGE_SIZE }, (_, index) =>
    candidate({
      sampleId: `filler-sample-${index}`,
      name: `filler-${String(index).padStart(2, '0')}.wav`,
    }),
  )
}

function setup(selected: string[] = [ALPHA, BETA]): {
  api: ReturnType<typeof createTestApi>
  importFolders: ReturnType<
    typeof vi.fn<(directories: string[]) => Promise<FolderImportOutcome[]>>
  >
  onClose: ReturnType<typeof vi.fn>
} {
  const api = createTestApi()
  api.dialog.openFolders.mockResolvedValue({ ok: true, data: selected })
  // A folder without conflicts never reaches the candidate channel; a conflicting
  // folder overrides this in the test that reads it.
  api.packs.listImportCandidates.mockResolvedValue({
    ok: true,
    data: { items: [], total: 0, limit: IMPORT_CONFLICT_PAGE_SIZE, offset: 0 },
  })
  vi.stubGlobal('api', api)
  const importFolders =
    vi.fn<(directories: string[]) => Promise<FolderImportOutcome[]>>()
  const onClose = vi.fn()
  render(<ImportDialog importFolders={importFolders} onClose={onClose} />)
  return { api, importFolders, onClose }
}

async function preparedPackMode(
  api: ReturnType<typeof createTestApi>,
): Promise<{
  alpha: HTMLElement
  beta: HTMLElement
}> {
  api.packs.prepareImport.mockImplementation(async ({ directory }) => ({
    ok: true,
    data:
      directory === ALPHA
        ? review(ALPHA_ROOT)
        : review(BETA_ROOT, { sampleCount: 2 }),
  }))
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )
  await waitFor(() => expect(api.packs.prepareImport).toHaveBeenCalledTimes(2))
  return {
    alpha: await screen.findByRole('region', { name: ALPHA }),
    beta: screen.getByRole('region', { name: BETA }),
  }
}

async function prepareConflictedFolder(
  api: ReturnType<typeof createTestApi>,
  conflictCount: number,
): Promise<void> {
  api.packs.prepareImport.mockImplementation(async ({ directory }) => ({
    ok: true,
    data:
      directory === ALPHA
        ? review(ALPHA_ROOT, { conflictCount })
        : review(BETA_ROOT, { sampleCount: 2 }),
  }))
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )
  await waitFor(() => expect(api.packs.prepareImport).toHaveBeenCalledTimes(2))
}

test('opens the multi-folder picker once and lists the selected folders in Pack mode', async () => {
  const { api } = setup()
  expect(
    await screen.findByRole('dialog', { name: 'Import folders' }),
  ).toBeVisible()
  expect(api.dialog.openFolders).toHaveBeenCalledTimes(1)
  const folders = screen.getByRole('list', { name: 'Selected folders' })
  expect(within(folders).getAllByRole('listitem')).toHaveLength(2)
  expect(folders).toHaveTextContent(ALPHA)
  expect(folders).toHaveTextContent(BETA)
  expect(
    screen.getByRole('radio', { name: 'One Pack per folder' }),
  ).toBeChecked()
  expect(
    screen.getByRole('radio', { name: 'Standalone Samples' }),
  ).not.toBeChecked()
})

test('closes without writing anything when folder selection is cancelled', async () => {
  const { api, importFolders, onClose } = setup([])
  await waitFor(() =>
    expect(onClose).toHaveBeenCalledWith({
      createdPacks: 0,
      importedFolders: 0,
    }),
  )
  expect(api.packs.prepareImport).not.toHaveBeenCalled()
  expect(importFolders).not.toHaveBeenCalled()
})

test('imports one standalone folder at a time when standalone Samples is chosen', async () => {
  const { api, importFolders, onClose } = setup()
  importFolders.mockResolvedValue([
    { directory: ALPHA, sampleCount: 3, error: null },
    { directory: BETA, sampleCount: 2, error: null },
  ])
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('radio', { name: 'Standalone Samples' }),
  )
  await user.click(screen.getByRole('button', { name: 'Import Samples' }))

  await waitFor(() => expect(importFolders).toHaveBeenCalledWith([ALPHA, BETA]))
  expect(api.packs.prepareImport).not.toHaveBeenCalled()
  expect(api.packs.importPack).not.toHaveBeenCalled()
  expect(await screen.findByRole('status')).toHaveTextContent(
    '2 of 2 folders imported.',
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledWith({
    createdPacks: 0,
    importedFolders: 2,
  })
})

test('prepares each folder once and shows its Sample and conflict counts', async () => {
  const { api } = setup()
  const { alpha, beta } = await preparedPackMode(api)

  expect(api.packs.prepareImport).toHaveBeenCalledWith({ directory: ALPHA })
  expect(api.packs.prepareImport).toHaveBeenCalledWith({ directory: BETA })
  expect(within(alpha).getByRole('textbox', { name: 'Pack name' })).toHaveValue(
    'alpha-breaks',
  )
  expect(alpha).toHaveTextContent('3 Samples')
  expect(alpha).toHaveTextContent('No conflicts')
  expect(beta).toHaveTextContent('2 Samples')
  expect(within(beta).getByRole('textbox', { name: 'Pack name' })).toHaveValue(
    'beta-hits',
  )
})

test('reports a folder that cannot be prepared without hiding the other folders', async () => {
  const { api } = setup()
  api.packs.prepareImport.mockImplementation(async ({ directory }) =>
    directory === ALPHA
      ? {
          ok: false,
          error: {
            code: 'FOLDER_FAILED',
            message: 'Unable to read the folder.',
          },
        }
      : { ok: true, data: review(BETA_ROOT, { sampleCount: 2 }) },
  )
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )

  const alpha = await screen.findByRole('region', { name: ALPHA })
  const beta = await screen.findByRole('region', { name: BETA })
  expect(api.packs.prepareImport).toHaveBeenCalledTimes(2)
  expect(await within(alpha).findByRole('alert')).toHaveTextContent(
    'Unable to read the folder.',
  )
  await waitFor(() =>
    expect(
      within(beta).getByRole('textbox', { name: 'Pack name' }),
    ).toHaveValue('beta-hits'),
  )
  expect(beta).toHaveTextContent('2 Samples')
  expect(screen.getByRole('button', { name: 'Create Packs' })).toBeDisabled()
})

test('creates one Pack per folder with the reviewed name', async () => {
  const { api, onClose } = setup()
  const { alpha } = await preparedPackMode(api)
  api.packs.importPack.mockImplementation(async (request) => ({
    ok: true,
    data: packRecord(request.name, request.sourceRootId),
  }))
  const user = userEvent.setup()
  const name = within(alpha).getByRole('textbox', { name: 'Pack name' })
  await user.clear(name)
  await user.type(name, 'Analog Drums')
  await user.click(screen.getByRole('button', { name: 'Create Packs' }))

  await waitFor(() => expect(api.packs.importPack).toHaveBeenCalledTimes(2))
  expect(api.packs.importPack).toHaveBeenCalledWith({
    sourceRootId: ALPHA_ROOT,
    token: TOKEN,
    name: 'Analog Drums',
    decisions: [],
  })
  expect(api.packs.importPack).toHaveBeenCalledWith({
    sourceRootId: BETA_ROOT,
    token: TOKEN,
    name: 'beta-hits',
    decisions: [],
  })
  expect(await screen.findByRole('status')).toHaveTextContent(
    '2 of 2 Packs created.',
  )
  expect(screen.getByRole('region', { name: ALPHA })).toHaveTextContent(
    'Created Pack “Analog Drums”.',
  )
  expect(screen.getByRole('region', { name: BETA })).toHaveTextContent(
    'Created Pack “beta-hits”.',
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledWith({ createdPacks: 2, importedFolders: 0 })
})

test('reports a partial batch instead of presenting it as full success', async () => {
  const { api } = setup()
  await preparedPackMode(api)
  api.packs.importPack.mockImplementation(async (request) =>
    request.sourceRootId === ALPHA_ROOT
      ? {
          ok: true,
          data: packRecord(request.name, request.sourceRootId),
        }
      : {
          ok: false,
          error: {
            code: 'STORAGE_FAILED',
            message: 'Unable to import the Pack.',
          },
        },
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create Packs' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    '1 of 2 Packs created.',
  )
  expect(screen.getByRole('status')).not.toHaveTextContent(
    '2 of 2 Packs created.',
  )
  expect(
    within(screen.getByRole('region', { name: BETA })).getByRole('alert'),
  ).toHaveTextContent('Unable to import the Pack.')
})

test('reads the conflicting Samples of a folder through the paged candidates channel', async () => {
  const { api } = setup()
  api.packs.listImportCandidates.mockResolvedValue({
    ok: true,
    data: {
      items: [KICK, SNARE, VOX],
      total: 3,
      limit: IMPORT_CONFLICT_PAGE_SIZE,
      offset: 0,
    },
  })
  await prepareConflictedFolder(api, 2)
  const alpha = await screen.findByRole('region', { name: ALPHA })
  const list = await within(alpha).findByRole('list', {
    name: 'Conflicting Samples',
  })
  const items = within(list).getAllByRole('listitem')

  expect(api.packs.listImportCandidates).toHaveBeenCalledWith({
    sourceRootId: ALPHA_ROOT,
    limit: IMPORT_CONFLICT_PAGE_SIZE,
    offset: 0,
  })
  // The beta folder reports no conflict, so it is never paged.
  expect(api.packs.listImportCandidates).toHaveBeenCalledTimes(1)
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent('kick.wav')
  expect(items[0]).toHaveTextContent(`${ALPHA}/kick.wav`)
  expect(items[0]).toHaveTextContent(
    conflictOriginNote({
      packId: OTHER_PACK_ID,
      originAssignment: 'automatic',
    }),
  )
  expect(items[1]).toHaveTextContent('vox.wav')
  expect(items[1]).toHaveTextContent(
    conflictOriginNote({ packId: null, originAssignment: 'manual' }),
  )
  expect(within(alpha).getByText(conflictSummary(2))).toBeVisible()
})

test('pages the conflicting Samples and keeps a decision made on an earlier page', async () => {
  const { api } = setup()
  api.packs.listImportCandidates.mockImplementation(async ({ offset }) => {
    const at = offset ?? 0
    return {
      ok: true,
      data:
        at === 0
          ? {
              items: [KICK, ...fillerPage().slice(1)],
              total: IMPORT_CONFLICT_PAGE_SIZE + 1,
              limit: IMPORT_CONFLICT_PAGE_SIZE,
              offset: at,
            }
          : {
              items: [VOX],
              total: IMPORT_CONFLICT_PAGE_SIZE + 1,
              limit: IMPORT_CONFLICT_PAGE_SIZE,
              offset: at,
            },
    }
  })
  await prepareConflictedFolder(api, 2)
  const alpha = await screen.findByRole('region', { name: ALPHA })
  const list = await within(alpha).findByRole('list', {
    name: 'Conflicting Samples',
  })
  const user = userEvent.setup()
  await user.click(
    within(list).getByRole('button', { name: keepDecisionAction('kick.wav') }),
  )

  await user.click(
    within(alpha).getByRole('button', {
      name: conflictReadMoreAction(
        IMPORT_CONFLICT_PAGE_SIZE,
        IMPORT_CONFLICT_PAGE_SIZE + 1,
      ),
    }),
  )

  await waitFor(() =>
    expect(api.packs.listImportCandidates).toHaveBeenCalledWith({
      sourceRootId: ALPHA_ROOT,
      limit: IMPORT_CONFLICT_PAGE_SIZE,
      offset: IMPORT_CONFLICT_PAGE_SIZE,
    }),
  )
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  expect(
    within(list).getByRole('button', { name: keepDecisionAction('kick.wav') }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(within(alpha).getByText(conflictBlockedReason(1, 2))).toBeVisible()
})

test('keeps confirmation blocked until every conflicting Sample has a decision', async () => {
  const { api } = setup()
  api.packs.listImportCandidates.mockResolvedValue({
    ok: true,
    data: {
      items: [KICK, VOX],
      total: 2,
      limit: IMPORT_CONFLICT_PAGE_SIZE,
      offset: 0,
    },
  })
  await prepareConflictedFolder(api, 2)
  const alpha = await screen.findByRole('region', { name: ALPHA })
  const list = await within(alpha).findByRole('list', {
    name: 'Conflicting Samples',
  })
  const user = userEvent.setup()

  expect(screen.getByRole('button', { name: 'Create Packs' })).toBeDisabled()
  expect(within(alpha).getByText(conflictBlockedReason(2, 2))).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Create Packs' }))
  expect(api.packs.importPack).not.toHaveBeenCalled()

  await user.click(
    within(list).getByRole('button', { name: keepDecisionAction('kick.wav') }),
  )
  expect(screen.getByRole('button', { name: 'Create Packs' })).toBeDisabled()
  expect(within(alpha).getByText(conflictBlockedReason(1, 2))).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Create Packs' }))
  expect(api.packs.importPack).not.toHaveBeenCalled()

  await user.click(
    within(list).getByRole('button', { name: assignDecisionAction('vox.wav') }),
  )
  expect(screen.getByRole('button', { name: 'Create Packs' })).toBeEnabled()
  expect(within(alpha).getByText(conflictDecidedStatus(2, 2))).toBeVisible()
})

test('decides every conflicting Sample explicitly when the bulk convenience is used', async () => {
  const { api } = setup()
  api.packs.prepareImport.mockImplementation(async ({ directory }) => ({
    ok: true,
    data:
      directory === ALPHA
        ? review(ALPHA_ROOT, {
            sampleCount: IMPORT_CONFLICT_PAGE_SIZE + 1,
            conflictCount: 2,
          })
        : review(BETA_ROOT, { sampleCount: 2 }),
  }))
  // Both conflicts sit behind a full candidate page, so the bulk choice must read
  // the rest of the folder before it can name them.
  api.packs.listImportCandidates.mockImplementation(async ({ offset }) => {
    const at = offset ?? 0
    return {
      ok: true,
      data: {
        items:
          at === 0
            ? fillerPage()
            : [KICK, VOX].slice(at - IMPORT_CONFLICT_PAGE_SIZE),
        total: IMPORT_CONFLICT_PAGE_SIZE + 2,
        limit: IMPORT_CONFLICT_PAGE_SIZE,
        offset: at,
      },
    }
  })
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )
  const alpha = await screen.findByRole('region', { name: ALPHA })
  await waitFor(() =>
    expect(api.packs.listImportCandidates).toHaveBeenCalledTimes(1),
  )

  await user.click(
    within(alpha).getByRole('button', { name: KEEP_ALL_CONFLICTS }),
  )

  const list = await within(alpha).findByRole('list', {
    name: 'Conflicting Samples',
  })
  await waitFor(() =>
    expect(within(list).getAllByRole('listitem')).toHaveLength(2),
  )
  expect(api.packs.listImportCandidates).toHaveBeenCalledWith({
    sourceRootId: ALPHA_ROOT,
    limit: IMPORT_CONFLICT_PAGE_SIZE,
    offset: IMPORT_CONFLICT_PAGE_SIZE,
  })
  expect(
    within(list).getByRole('button', { name: keepDecisionAction('vox.wav') }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(within(alpha).getByText(conflictDecidedStatus(2, 2))).toBeVisible()

  api.packs.importPack.mockImplementation(async (request) => ({
    ok: true,
    data: packRecord(request.name, request.sourceRootId),
  }))
  await user.click(screen.getByRole('button', { name: 'Create Packs' }))
  await waitFor(() => expect(api.packs.importPack).toHaveBeenCalledTimes(2))
  expect(api.packs.importPack).toHaveBeenCalledWith({
    sourceRootId: ALPHA_ROOT,
    token: TOKEN,
    name: 'alpha-breaks',
    decisions: [
      { sampleId: KICK_ID, resolution: 'keep' },
      { sampleId: VOX_ID, resolution: 'keep' },
    ],
  })
  expect(api.packs.importPack).toHaveBeenCalledWith({
    sourceRootId: BETA_ROOT,
    token: TOKEN,
    name: 'beta-hits',
    decisions: [],
  })
})

test('carries one explicit decision per conflicting Sample to the commit', async () => {
  const { api } = setup()
  api.packs.listImportCandidates.mockResolvedValue({
    ok: true,
    data: {
      items: [KICK, VOX],
      total: 2,
      limit: IMPORT_CONFLICT_PAGE_SIZE,
      offset: 0,
    },
  })
  await prepareConflictedFolder(api, 2)
  const alpha = await screen.findByRole('region', { name: ALPHA })
  const list = await within(alpha).findByRole('list', {
    name: 'Conflicting Samples',
  })
  api.packs.importPack.mockImplementation(async (request) => ({
    ok: true,
    data: packRecord(request.name, request.sourceRootId),
  }))
  const user = userEvent.setup()
  await user.click(
    within(list).getByRole('button', { name: keepDecisionAction('kick.wav') }),
  )
  await user.click(
    within(list).getByRole('button', { name: assignDecisionAction('vox.wav') }),
  )

  expect(
    within(list).getByRole('button', { name: keepDecisionAction('kick.wav') }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    within(list).getByRole('button', {
      name: assignDecisionAction('vox.wav'),
    }),
  ).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: 'Create Packs' }))
  await waitFor(() => expect(api.packs.importPack).toHaveBeenCalledTimes(2))
  expect(api.packs.importPack).toHaveBeenCalledWith({
    sourceRootId: ALPHA_ROOT,
    token: TOKEN,
    name: 'alpha-breaks',
    decisions: [
      { sampleId: KICK_ID, resolution: 'keep' },
      { sampleId: VOX_ID, resolution: 'assign' },
    ],
  })
  expect(await screen.findByRole('status')).toHaveTextContent(
    '2 of 2 Packs created.',
  )
  expect(screen.getByRole('region', { name: ALPHA })).toHaveTextContent(
    'Created Pack “alpha-breaks”.',
  )
})

test('reports a commit the worker refuses as that folder’s failure', async () => {
  const { api } = setup()
  api.packs.listImportCandidates.mockResolvedValue({
    ok: true,
    data: {
      items: [KICK, VOX],
      total: 2,
      limit: IMPORT_CONFLICT_PAGE_SIZE,
      offset: 0,
    },
  })
  await prepareConflictedFolder(api, 2)
  const alpha = await screen.findByRole('region', { name: ALPHA })
  await within(alpha).findByRole('list', { name: 'Conflicting Samples' })
  api.packs.importPack.mockImplementation(async (request) =>
    request.sourceRootId === ALPHA_ROOT
      ? {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Every origin conflict requires an explicit decision.',
          },
        }
      : { ok: true, data: packRecord(request.name, request.sourceRootId) },
  )
  const user = userEvent.setup()
  await user.click(
    within(alpha).getByRole('button', { name: ASSIGN_ALL_CONFLICTS }),
  )
  await waitFor(() =>
    expect(within(alpha).getByText(conflictDecidedStatus(2, 2))).toBeVisible(),
  )

  await user.click(screen.getByRole('button', { name: 'Create Packs' }))

  expect(await screen.findByRole('status')).toHaveTextContent(
    '1 of 2 Packs created.',
  )
  expect(
    within(screen.getByRole('region', { name: ALPHA })).getByRole('alert'),
  ).toHaveTextContent('Every origin conflict requires an explicit decision.')
  expect(screen.getByRole('region', { name: BETA })).toHaveTextContent(
    'Created Pack “beta-hits”.',
  )
})

test('adds no conflict step to a folder whose review reports none', async () => {
  const { api } = setup()
  const { alpha } = await preparedPackMode(api)

  expect(api.packs.listImportCandidates).not.toHaveBeenCalled()
  expect(
    within(alpha).queryByRole('list', { name: 'Conflicting Samples' }),
  ).not.toBeInTheDocument()
  expect(within(alpha).queryByText(conflictSummary(1))).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create Packs' })).toBeEnabled()

  api.packs.importPack.mockImplementation(async (request) => ({
    ok: true,
    data: packRecord(request.name, request.sourceRootId),
  }))
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Create Packs' }))
  await waitFor(() =>
    expect(api.packs.importPack).toHaveBeenCalledWith({
      sourceRootId: ALPHA_ROOT,
      token: TOKEN,
      name: 'alpha-breaks',
      decisions: [],
    }),
  )
})

test('shows a folder that already has a Pack as already imported and excludes it from creation', async () => {
  const { api } = setup()
  api.packs.prepareImport.mockImplementation(async ({ directory }) => ({
    ok: true,
    data:
      directory === ALPHA
        ? review(ALPHA_ROOT, {
            pack: packRecord('Analog Drums', ALPHA_ROOT),
          })
        : review(BETA_ROOT, { sampleCount: 2 }),
  }))
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )
  const alpha = await screen.findByRole('region', { name: ALPHA })
  const beta = screen.getByRole('region', { name: BETA })
  await waitFor(() =>
    expect(
      within(beta).getByRole('textbox', { name: 'Pack name' }),
    ).toHaveValue('beta-hits'),
  )

  expect(alpha).toHaveTextContent(alreadyImportedStatus('Analog Drums'))
  expect(alpha).toHaveTextContent('3 Samples')
  expect(
    within(alpha).queryByRole('textbox', { name: 'Pack name' }),
  ).not.toBeInTheDocument()
  expect(within(alpha).getByRole('alert')).toHaveTextContent(
    ALREADY_REGISTERED_REASON,
  )
  const create = screen.getByRole('button', { name: 'Create Packs' })
  expect(create).toBeDisabled()
  await user.click(create)
  expect(api.packs.importPack).not.toHaveBeenCalled()
})

test('states that preparing catalogs Samples and that cancelling keeps them standalone', async () => {
  const { api, importFolders, onClose } = setup()
  expect(await screen.findByText(PREPARE_CONSEQUENCE_NOTE)).toBeVisible()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledWith({
    createdPacks: 0,
    importedFolders: 0,
  })
  expect(api.packs.prepareImport).not.toHaveBeenCalled()
  expect(importFolders).not.toHaveBeenCalled()
})

test('cancelling after preparing creates no Pack and keeps the prepared Samples', async () => {
  const { api, onClose } = setup()
  await preparedPackMode(api)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledWith({
    createdPacks: 0,
    importedFolders: 0,
  })
  expect(api.packs.importPack).not.toHaveBeenCalled()
})
