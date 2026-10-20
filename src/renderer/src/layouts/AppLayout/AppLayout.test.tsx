import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { useCatalogViewContext } from '@renderer/routes/navigationContext'
import {
  defaultContext,
  useNavigationStore,
} from '@renderer/stores/useNavigationStore'

// Keep routing, shell and restoration real; unrelated media/IPC is not exercised.
vi.mock('@renderer/features/library/hooks/useLibrarySession', () => ({
  useLibrarySession: () => ({ loading: false, error: null }),
}))
vi.mock(
  '@renderer/features/library/components/PreviewPlayer/PreviewPlayer',
  () => ({
    PreviewPlayer: () => <button>Player control</button>,
  }),
)

function Catalog({ ready }: { ready: boolean }): React.JSX.Element {
  const { onReady } = useCatalogViewContext()
  const { key } = useLocation()
  const [loaded, setLoaded] = useState(ready)
  useEffect(() => {
    if (loaded) {
      onReady()
    }
  }, [loaded, key, onReady])
  return (
    <>
      <h1>Catalog</h1>
      <input type="search" aria-label="Search samples" />
      {!loaded && (
        <button onClick={() => setLoaded(true)}>Finish loading</button>
      )}
      <div role="grid">
        <div role="row" aria-selected="true" tabIndex={0}>
          Selected Sample
        </div>
      </div>
    </>
  )
}

let frames: Map<number, FrameRequestCallback>

beforeEach(() => {
  useNavigationStore.setState({
    entries: {},
    destinations: {
      '/samples': { ...defaultContext, scrollTop: 120 },
    },
  })
  frames = new Map()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  useNavigationStore.setState({ entries: {}, destinations: {} })
})

function flushFrames(): void {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  })
}

function setup(ready = true): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/samples', element: <Catalog ready={ready} /> },
          { path: '/favorites', element: <Catalog ready /> },
        ],
      },
    ],
    { initialEntries: ['/samples'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

test('restores selection and scroll once results are ready without user interaction', () => {
  setup()
  const main = screen.getByRole('main')
  expect(frames.size).toBe(1)
  flushFrames()
  expect(screen.getByRole('row', { selected: true })).toHaveFocus()
  expect(main.scrollTop).toBe(120)
})

test.each([true, false])(
  'typing keeps focus and scroll when restoration is pending (results ready: %s)',
  async (ready) => {
    const user = userEvent.setup()
    setup(ready)
    const main = screen.getByRole('main')
    const search = screen.getByRole('searchbox', { name: 'Search samples' })
    await user.type(search, 'snare KICK HOUSE')
    if (!ready) {
      fireEvent.click(screen.getByRole('button', { name: 'Finish loading' }))
    }
    flushFrames()
    expect(search).toHaveFocus()
    expect(search).toHaveValue('snare KICK HOUSE')
    expect(main.scrollTop).toBe(0)
  },
)

test('pending restoration yields to interaction with the permanent player', async () => {
  const user = userEvent.setup()
  setup()
  const player = screen.getByRole('button', { name: 'Player control' })
  await user.click(player)
  flushFrames()
  expect(player).toHaveFocus()
})

test.each(['focus', 'pointer', 'keyboard'] as const)(
  'pending restoration yields to %s intent before the next frame',
  (interaction) => {
    setup()
    const search = screen.getByRole('searchbox', { name: 'Search samples' })
    if (interaction === 'focus') {
      act(() => search.focus())
    } else if (interaction === 'pointer') {
      fireEvent.pointerDown(search)
    } else {
      fireEvent.keyDown(document, { key: 'Tab' })
    }
    flushFrames()
    expect(screen.getByRole('main').scrollTop).toBe(0)
    expect(screen.getByRole('row', { selected: true })).not.toHaveFocus()
  },
)

test('navigation cancels obsolete frames and enables restoration for the next destination', async () => {
  const router = setup()
  await act(async () => router.navigate('/favorites'))
  expect(frames.size).toBe(1)
  flushFrames()
  expect(screen.getByRole('row', { selected: true })).toHaveFocus()
  expect(screen.getByRole('main').scrollTop).toBe(0)
})

test('unmount removes pending frames and interaction listeners', () => {
  const removeListener = vi.spyOn(document, 'removeEventListener')
  const { unmount } = render(
    <RouterProvider
      router={createMemoryRouter([
        {
          element: <AppLayout />,
          children: [{ path: '/', element: <Catalog ready /> }],
        },
      ])}
    />,
  )
  expect(frames.size).toBe(1)
  unmount()
  expect(frames.size).toBe(0)
  for (const event of ['focusin', 'pointerdown', 'keydown']) {
    expect(removeListener).toHaveBeenCalledWith(
      event,
      expect.any(Function),
      true,
    )
  }
})
