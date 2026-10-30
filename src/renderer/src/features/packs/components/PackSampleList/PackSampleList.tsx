import { Button } from '@renderer/components/ui/Button'
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableColumnGroup,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/Table'
import { usePackSamples } from '../../hooks/usePackSamples'
import './PackSampleList.css'

// The Samples under a Pack are a bounded read of their own: its states stay
// beside the header instead of sharing the Pack read's outcome.
export function PackSampleList({ id }: { id: string }): React.JSX.Element {
  const { page, loading, error, load, refresh } = usePackSamples(id)

  return (
    <div className="pack-sample-list">
      {loading && <p role="status">Loading Samples…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {page && (
        <>
          <p>
            {page.total} {page.total === 1 ? 'Sample' : 'Samples'}
          </p>
          {page.total === 0 ? (
            <p>No Samples in this Pack.</p>
          ) : (
            <>
              <Table
                className="pack-sample-table"
                aria-label="Samples in this Pack"
                stickyHeader
              >
                <TableColumnGroup>
                  <TableColumn />
                  <TableColumn />
                  <TableColumn className="pack-sample-origin-column" />
                </TableColumnGroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Source path</TableHead>
                    <TableHead>Origin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-label="Pack Sample rows">
                  {page.items.map((sample) => (
                    <TableRow key={sample.sampleId}>
                      <TableCell>{sample.name}</TableCell>
                      <TableCell className="pack-sample-path">
                        {sample.path}
                      </TableCell>
                      <TableCell>
                        {sample.originAssignment === 'manual'
                          ? 'Manual origin'
                          : 'Automatic origin'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <nav
                className="pack-sample-pagination"
                aria-label="Pack Sample pages"
              >
                <Button
                  disabled={loading || page.offset === 0}
                  onClick={() => load(Math.max(0, page.offset - page.limit))}
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
                  onClick={() => load(page.offset + page.limit)}
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
