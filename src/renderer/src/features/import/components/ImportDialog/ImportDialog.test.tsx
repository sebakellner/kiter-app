import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Pack, PackImportReview } from '@shared/domain/pack'
import type { FolderImportOutcome } from '@renderer/features/library/hooks/useLibrary'
import { createTestApi } from '../../../../../../../tests/support/ui/bridge'
import {
  ALREADY_REGISTERED_REASON,
  alreadyImportedStatus,
  conflictMessage,
  PREPARE_CONSEQUENCE_NOTE,
} from '../../copy'
import { ImportDialog } from './ImportDialog'

const ALPHA = '/library/alpha-breaks'
const BETA = '/library/beta-hits'
const ALPHA_ROOT = '11111111-1111-4111-8111-111111111111'
const BETA_ROOT = '22222222-2222-4222-8222-222222222222'
const PACK_ID = '33333333-3333-4333-8333-333333333333'
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

function setup(selected: string[] = [ALPHA, BETA]): {
  api: ReturnType<typeof createTestApi>
  importFolders: ReturnType<
    typeof vi.fn<(directories: string[]) => Promise<FolderImportOutcome[]>>
  >
  onClose: ReturnType<typeof vi.fn>
} {
  const api = createTestApi()
  api.dialog.openFolders.mockResolvedValue({ ok: true, data: selected })
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

test('blocks confirmation while a folder reports conflicting Samples', async () => {
  const { api } = setup()
  api.packs.prepareImport.mockImplementation(async ({ directory }) => ({
    ok: true,
    data:
      directory === ALPHA
        ? review(ALPHA_ROOT, { conflictCount: 2 })
        : review(BETA_ROOT, { sampleCount: 2 }),
  }))
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Prepare folders' }),
  )
  const alpha = await screen.findByRole('region', { name: ALPHA })

  expect(await within(alpha).findByRole('alert')).toHaveTextContent(
    conflictMessage(2),
  )
  expect(alpha).toHaveTextContent('2 conflicts')
  const create = screen.getByRole('button', { name: 'Create Packs' })
  expect(create).toBeDisabled()
  await user.click(create)
  expect(api.packs.importPack).not.toHaveBeenCalled()
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
