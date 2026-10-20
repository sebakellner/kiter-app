import type { ComponentPropsWithRef, JSX } from 'react'
import './Table.css'

export type TableScrollAreaProps = ComponentPropsWithRef<'div'>
export type TableProps = ComponentPropsWithRef<'table'> & {
  stickyHeader?: boolean
}
export type TableHeaderProps = ComponentPropsWithRef<'thead'>
export type TableBodyProps = ComponentPropsWithRef<'tbody'>
export type TableFooterProps = ComponentPropsWithRef<'tfoot'>
export type TableColumnGroupProps = ComponentPropsWithRef<'colgroup'>
export type TableColumnProps = ComponentPropsWithRef<'col'>
export type TableRowProps = ComponentPropsWithRef<'tr'> & {
  'data-selected'?: boolean
}
export type TableHeadProps = ComponentPropsWithRef<'th'>
export type TableCellProps = ComponentPropsWithRef<'td'>
export type TableCaptionProps = ComponentPropsWithRef<'caption'>

export function TableScrollArea({
  className,
  ...props
}: TableScrollAreaProps): JSX.Element {
  return (
    <div
      tabIndex={0}
      role="region"
      {...props}
      className={className ? `ui-table-scroll ${className}` : 'ui-table-scroll'}
    />
  )
}

export function Table({
  className,
  stickyHeader = false,
  ...props
}: TableProps): JSX.Element {
  return (
    <table
      {...props}
      data-sticky-header={stickyHeader || undefined}
      className={className ? `ui-table ${className}` : 'ui-table'}
    />
  )
}

export function TableHeader(props: TableHeaderProps): JSX.Element {
  return <thead {...props} />
}

export function TableBody(props: TableBodyProps): JSX.Element {
  return <tbody {...props} />
}

export function TableFooter(props: TableFooterProps): JSX.Element {
  return <tfoot {...props} />
}

export function TableColumnGroup(props: TableColumnGroupProps): JSX.Element {
  return <colgroup {...props} />
}

export function TableColumn(props: TableColumnProps): JSX.Element {
  return <col {...props} />
}

export function TableRow(props: TableRowProps): JSX.Element {
  return <tr {...props} />
}

export function TableHead({
  scope = 'col',
  ...props
}: TableHeadProps): JSX.Element {
  return <th {...props} scope={scope} />
}

export function TableCell(props: TableCellProps): JSX.Element {
  return <td {...props} />
}

export function TableCaption(props: TableCaptionProps): JSX.Element {
  return <caption {...props} />
}
