import { createRef } from 'react'
import type { JSX } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Button } from '../Button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableColumn,
  TableColumnGroup,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableScrollArea,
} from './index'

test('primitives preserve table semantics, native props and refs', async () => {
  const user = userEvent.setup()
  const tableRef = createRef<HTMLTableElement>()
  const rowRef = createRef<HTMLTableRowElement>()
  const cellRef = createRef<HTMLTableCellElement>()
  const columnRef = createRef<HTMLTableColElement>()
  const groupRef = createRef<HTMLTableColElement>()
  const footerRef = createRef<HTMLTableSectionElement>()
  const onKeyDown = vi.fn()
  render(
    <TableScrollArea aria-label="Library scroll area">
      <Table ref={tableRef} stickyHeader>
        <TableCaption>Library</TableCaption>
        <TableColumnGroup ref={groupRef}>
          <TableColumn ref={columnRef} span={2} />
        </TableColumnGroup>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow ref={rowRef} tabIndex={0} onKeyDown={onKeyDown}>
            <TableHead scope="row">Drums</TableHead>
            <TableCell ref={cellRef}>6</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter ref={footerRef}>
          <TableRow>
            <TableCell colSpan={2}>1 group</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </TableScrollArea>,
  )

  expect(tableRef.current).toBe(screen.getByRole('table', { name: 'Library' }))
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'scope',
    'col',
  )
  expect(screen.getByRole('rowheader', { name: 'Drums' })).toHaveAttribute(
    'scope',
    'row',
  )
  expect(cellRef.current).toBe(screen.getByRole('cell', { name: '6' }))
  expect(groupRef.current?.tagName).toBe('COLGROUP')
  expect(columnRef.current?.parentElement).toBe(groupRef.current)
  expect(columnRef.current).toHaveAttribute('span', '2')
  expect(footerRef.current?.tagName).toBe('TFOOT')
  expect(screen.getByRole('cell', { name: '1 group' })).toHaveAttribute(
    'colspan',
    '2',
  )
  await user.tab()
  expect(screen.getByRole('region')).toHaveFocus()
  await user.tab()
  expect(rowRef.current).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(onKeyDown).toHaveBeenCalledOnce()
})

test('custom row components compose actions and preserve identities across reordering', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  const onSelect = vi.fn()
  const items = [
    { id: 'b', name: 'Snare' },
    { id: 'a', name: 'Kick' },
  ]

  function ItemRow({ item }: { item: (typeof items)[number] }): JSX.Element {
    return (
      <TableRow
        data-selected={item.id === 'a'}
        onClick={() => onSelect(item.id)}
      >
        <TableCell>
          <Button
            onClick={(event) => {
              event.stopPropagation()
              onOpen(item.id)
            }}
          >
            {item.name}
          </Button>
        </TableCell>
      </TableRow>
    )
  }

  function Items({ reversed = false }: { reversed?: boolean }): JSX.Element {
    return (
      <Table aria-label="Items">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(reversed ? [...items].reverse() : items).map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </TableBody>
      </Table>
    )
  }

  const { rerender } = render(<Items />)
  const originalButton = screen.getByRole('button', { name: 'Snare' })
  expect(screen.getByRole('row', { name: 'Kick' })).toHaveAttribute(
    'data-selected',
    'true',
  )
  await user.click(originalButton)
  expect(onOpen).toHaveBeenCalledWith('b')
  expect(onSelect).not.toHaveBeenCalled()
  await user.click(screen.getByRole('row', { name: 'Kick' }))
  expect(onSelect).toHaveBeenCalledWith('a')
  rerender(<Items reversed />)
  expect(screen.getByRole('button', { name: 'Snare' })).toBe(originalButton)
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent),
  ).toEqual(['Kick', 'Snare'])
})

test('sort controls compose inside headers without implicit sorting state', async () => {
  const user = userEvent.setup()
  const onSort = vi.fn()
  const { rerender } = render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button onClick={onSort}>Name</Button>
          </TableHead>
        </TableRow>
      </TableHeader>
    </Table>,
  )
  await user.tab()
  await user.keyboard('{Enter}')
  expect(onSort).toHaveBeenCalledOnce()
  expect(screen.getByRole('columnheader')).not.toHaveAttribute('aria-sort')
  rerender(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead aria-sort="ascending">
            <Button onClick={onSort}>Name</Button>
          </TableHead>
        </TableRow>
      </TableHeader>
    </Table>,
  )
  expect(screen.getByRole('columnheader')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  await user.keyboard(' ')
  expect(onSort).toHaveBeenCalledTimes(2)
})

test('grouped headings and empty content preserve consumer-defined spans', () => {
  render(
    <Table aria-label="Library">
      <TableHeader>
        <TableRow>
          <TableHead rowSpan={2}>Name</TableHead>
          <TableHead scope="colgroup" colSpan={2}>
            Metadata
          </TableHead>
        </TableRow>
        <TableRow>
          <TableHead>Duration</TableHead>
          <TableHead>Format</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={3}>
            No results. <Button>Clear filters</Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  )
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'rowspan',
    '2',
  )
  const group = screen.getByRole('columnheader', { name: 'Metadata' })
  expect(group).toHaveAttribute('scope', 'colgroup')
  expect(group).toHaveAttribute('colspan', '2')
  expect(screen.getByRole('cell')).toHaveAttribute('colspan', '3')
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()
})

test('conditional columns and refresh state remain consumer-owned', () => {
  function Items({
    showCount = true,
    busy = false,
  }: {
    showCount?: boolean
    busy?: boolean
  }): JSX.Element {
    return (
      <Table aria-busy={busy}>
        <TableColumnGroup>
          <TableColumn />
          {showCount && <TableColumn />}
        </TableColumnGroup>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {showCount && <TableHead>Count</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Drums</TableCell>
            {showCount && <TableCell>6</TableCell>}
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  const { rerender } = render(<Items />)
  expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  expect(screen.getAllByRole('cell')).toHaveLength(2)
  rerender(<Items showCount={false} busy />)
  expect(screen.getAllByRole('columnheader')).toHaveLength(1)
  expect(screen.getAllByRole('cell')).toHaveLength(1)
  expect(screen.getByRole('cell', { name: 'Drums' })).toBeVisible()
  expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
})
