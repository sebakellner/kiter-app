# Table

Compose tables explicitly with JSX. Import the primitives from this module's
`index.ts`; there is no data/configuration wrapper or implicit state.

```tsx
<TableScrollArea aria-label="Library items" style={{ maxHeight: 400 }}>
  <Table stickyHeader>
    <TableCaption>Library items</TableCaption>
    <TableColumnGroup>
      <TableColumn />
      <TableColumn style={{ width: 96 }} />
    </TableColumnGroup>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead style={{ textAlign: 'right' }}>Count</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.length === 0 ? (
        <TableRow>
          <TableCell colSpan={2}>No results.</TableCell>
        </TableRow>
      ) : (
        items.map((item) => (
          <TableRow key={item.id} data-selected={item.id === selectedId}>
            <TableCell>{item.name}</TableCell>
            <TableCell style={{ textAlign: 'right' }}>{item.count}</TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell colSpan={2}>{items.length} items</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
</TableScrollArea>
```

## Composition contracts

- Every primitive preserves native props and refs. `Table` renders only a native
  `table`; `TableScrollArea` is an optional, explicit wrapper. Custom row and cell
  components can return these primitives without registration or context.
- `TableHead` defaults to `scope="col"`. Use `scope="row"` for row headings and
  native `colSpan`/`rowSpan` and appropriate scope/headers for grouped headings.
- `TableColumnGroup` and `TableColumn` render `colgroup` and `col`. Use native
  `span`, `style.width` and table layout rules for column geometry. Render
  corresponding columns, headings and cells conditionally to control visibility;
  keep their order and spans consistent. No preferences are stored implicitly.
- Compose sorting controls inside `TableHead` with `Button`. Set `aria-sort` on
  the active sorted header and give the button a meaningful name. The feature
  owns the sort state, handlers and query order; the table never sorts data.
- Give the table an accessible name through `TableCaption`, `aria-label` or
  `aria-labelledby`. Label `TableScrollArea` too: it is a keyboard-focusable
  scrolling region. Give it a height/max-height for vertical scrolling.
  `stickyHeader` pins the header to the nearest scrolling ancestor.
- Features map data using stable identity keys and compose loading, empty, error
  and footer content explicitly. Use a spanning `TableCell` for empty content.
  Native `aria-busy` can mark a refresh while retaining existing rows. Do not
  present a failed query as an empty successful result.
- `data-selected` applies visual selection without changing table semantics.
  Row click handlers, checkboxes, actions and keyboard behavior are caller-owned.
  No grid role, selection state, arrow navigation, pagination, resizing or drag
  behavior is introduced implicitly. Interactive grids need a separate
  feature-level accessibility contract.

The visual foundation retains Kiter's existing typography, neutral surfaces,
separators and focus tokens. Native table layout aligns headers and cells; text
wraps instead of being silently clipped, and selected rows retain their selection
surface on hover/focus. Sticky grouped headers move together as one header section.
