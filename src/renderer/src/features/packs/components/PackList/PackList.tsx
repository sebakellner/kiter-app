import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Checkbox } from '@renderer/components/ui/Checkbox/Checkbox'
import {
  Table,
  TableBody,
  TableColumn,
  TableColumnGroup,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/Table'
import type { Pack } from '@shared/domain/pack'
import { usePacks } from '../../hooks/usePacks'
import { PackListRow } from './PackListRow'
import './PackList.css'

export function PackList(): React.JSX.Element {
  const { page, loading, error, load, refresh } = usePacks()
  // Inspecting a Pack and checking Packs are separate: a row can be inspected
  // without being checked, and clearing the checks never moves the inspection.
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // The inspected Pack leaves with its page; a checked Pack stays until cleared.
  function changePage(offset: number): void {
    setInspectedId(null)
    load(offset)
  }

  const pageIds = page?.items.map((pack) => pack.id) ?? []
  const checkedOnPage = pageIds.filter((id) => checkedIds.has(id)).length
  const outsidePage = checkedIds.size - checkedOnPage
  const allOnPageChecked =
    pageIds.length > 0 && checkedOnPage === pageIds.length

  function toggleChecked(id: string, checked: boolean): void {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  function togglePage(checked: boolean): void {
    setCheckedIds((current) => {
      const next = new Set(current)
      for (const id of pageIds) {
        if (checked) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }

  function rowProps(index: number, pack: Pack): ComponentProps<'tr'> {
    return {
      role: 'row',
      'aria-selected': inspectedId === pack.id,
      tabIndex:
        inspectedId === pack.id || (inspectedId === null && index === 0)
          ? 0
          : -1,
      onClick: (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, a')
        ) {
          return
        }
        setInspectedId(pack.id)
        event.currentTarget.focus()
      },
      onKeyDown: (event) => {
        if (
          event.target !== event.currentTarget ||
          (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
        ) {
          return
        }
        event.preventDefault()
        const nextIndex = Math.max(
          0,
          Math.min(
            pageIds.length - 1,
            index + (event.key === 'ArrowDown' ? 1 : -1),
          ),
        )
        setInspectedId(pageIds[nextIndex])
        const row = event.currentTarget.parentElement?.children[nextIndex]
        if (row instanceof HTMLElement) {
          row.focus()
        }
      },
    }
  }

  return (
    <div className="pack-list">
      {loading && <p role="status">Loading Packs…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {page && (
        <>
          <p>
            {page.total} {page.total === 1 ? 'Pack' : 'Packs'}
          </p>
          {page.total === 0 ? (
            <p>
              No Packs yet. Import a folder to add its Samples as a Pack.
              Original audio files stay in place.
            </p>
          ) : (
            <>
              {checkedIds.size > 0 && (
                <div className="pack-list-selection">
                  <p role="status">
                    {checkedIds.size} selected
                    {outsidePage > 0 && ` (${outsidePage} outside this page)`}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => setCheckedIds(new Set())}
                  >
                    Clear selection
                  </Button>
                </div>
              )}
              <Table
                className="pack-list-table"
                role="grid"
                aria-label="Packs"
                stickyHeader
              >
                <TableColumnGroup>
                  <TableColumn className="pack-list-control-column" />
                  <TableColumn />
                  <TableColumn />
                </TableColumnGroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pack-list-control-head">
                      <Checkbox
                        checked={allOnPageChecked}
                        aria-label="Select all Packs on this page"
                        onChange={(event) =>
                          togglePage(event.currentTarget.checked)
                        }
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-label="Pack rows">
                  {page.items.map((pack, index) => (
                    <PackListRow
                      key={pack.id}
                      pack={pack}
                      rowProps={rowProps(index, pack)}
                      checked={checkedIds.has(pack.id)}
                      onCheckedChange={(checked) =>
                        toggleChecked(pack.id, checked)
                      }
                    />
                  ))}
                </TableBody>
              </Table>
              <nav className="pack-list-pagination" aria-label="Pack pages">
                <Button
                  disabled={loading || page.offset === 0}
                  onClick={() =>
                    changePage(Math.max(0, page.offset - page.limit))
                  }
                >
                  Previous page
                </Button>
                <span>
                  {page.offset + 1}–
                  {Math.min(page.offset + page.items.length, page.total)} of{' '}
                  {page.total}
                </span>
                <Button
                  disabled={loading || page.offset + page.limit >= page.total}
                  onClick={() => changePage(page.offset + page.limit)}
                >
                  Next page
                </Button>
              </nav>
            </>
          )}
        </>
      )}
    </div>
  )
}
