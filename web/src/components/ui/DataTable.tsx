import { useState } from 'react'
import styles from './ui.module.css'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  getValue?: (row: T) => string | number
}

interface DataTableProps<T extends object> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  isLoading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  emptyIcon?: string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  skeletonRows?: number
}

export function DataTable<T extends object>({
  columns,
  data,
  keyField,
  isLoading,
  emptyMessage = 'No data',
  emptyDescription,
  emptyIcon = '📭',
  onRowClick,
  rowClassName,
  skeletonRows = 5,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0
    const col = columns.find(c => c.key === sortKey)
    if (!col) return 0
    const va = col.getValue ? col.getValue(a) : String((a as Record<string, unknown>)[sortKey] ?? '')
    const vb = col.getValue ? col.getValue(b) : String((b as Record<string, unknown>)[sortKey] ?? '')
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  if (!isLoading && data.length === 0) {
    return (
      <div className={styles.tableWrapper}>
        <EmptyState icon={emptyIcon} title={emptyMessage} description={emptyDescription} />
      </div>
    )
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${styles.th} ${col.sortable ? styles.thSortable : ''}`}
                style={{ width: col.width, textAlign: col.align ?? 'left' }}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && sortKey === col.key && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  {columns.map(col => (
                    <td key={col.key} className={styles.td}>
                      <span
                        className={styles.skeleton}
                        style={{ width: `${60 + Math.random() * 30}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : sortedData.map(row => (
                <tr
                  key={String(row[keyField])}
                  className={`${styles.tr} ${onRowClick ? styles.trClickable : ''} ${rowClassName?.(row) ?? ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={styles.td}
                      style={{ textAlign: col.align ?? 'left' }}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}
