import type { ComponentProps } from 'react'
import { Checkbox } from '@renderer/components/ui/Checkbox/Checkbox'
import { TableCell, TableRow } from '@renderer/components/ui/Table'
import type { PackListItem } from '@shared/ipc/packs'

type Props = {
  pack: PackListItem
  rowProps: ComponentProps<'tr'>
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function PackListRow({
  pack,
  rowProps,
  checked,
  onCheckedChange,
}: Props): React.JSX.Element {
  return (
    <TableRow {...rowProps} data-pack-id={pack.id}>
      <TableCell role="gridcell" className="pack-row-control">
        <label
          className="pack-row-check"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={checked}
            aria-label={`Select Pack ${pack.name}`}
            onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          />
        </label>
      </TableCell>
      <TableCell role="gridcell">
        <div className="pack-row-name">{pack.name}</div>
        <div className="pack-row-path">{pack.sourceRootPath}</div>
      </TableCell>
      <TableCell role="gridcell" className="pack-row-description">
        {pack.description}
      </TableCell>
    </TableRow>
  )
}
