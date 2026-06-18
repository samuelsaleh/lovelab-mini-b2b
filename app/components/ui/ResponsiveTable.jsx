'use client'

import { colors } from '@/lib/styles'

/**
 * ResponsiveTable — one data source, two presentations.
 *
 * On desktop it renders a normal <table>. When `compact` is true (phone or
 * iPad portrait) it renders a stacked list of cards: each row becomes a card
 * with label/value pairs, so no horizontal scrolling is required.
 *
 * Props:
 *   columns  — array of column configs:
 *     {
 *       key,                     // unique column id
 *       label,                   // header text (also used as card field label)
 *       render?: (row, i) => node, // cell content; defaults to row[key]
 *       align?: 'left'|'right'|'center',
 *       thStyle?, tdStyle?,      // extra cell styles (desktop)
 *       primary?: boolean,       // show as the card title (no label) in compact
 *       hideLabelOnCard?: boolean, // render value without its label in compact
 *       hideOnCompact?: boolean, // omit this field entirely from cards
 *       cardFullWidth?: boolean, // give this field its own full-width row in card
 *     }
 *   rows      — array of row objects
 *   rowKey    — (row, i) => string|number  (defaults to index)
 *   compact   — boolean; when true renders cards instead of a table
 *   minWidth  — desktop table min width (enables horizontal scroll container)
 *   onRowClick— optional (row, i) => void
 *   emptyText — shown when rows is empty
 *   cardActions — optional (row, i) => node rendered at the bottom of each card
 *   tableProps — optional extra props/style for the <table>
 *   'data-testid' — forwarded to the wrapper
 */
export default function ResponsiveTable({
  columns = [],
  rows = [],
  rowKey,
  compact = false,
  minWidth,
  onRowClick,
  emptyText = 'No data',
  cardActions,
  tableProps = {},
  'data-testid': testId,
}) {
  const keyOf = (row, i) => (rowKey ? rowKey(row, i) : i)

  if (!rows || rows.length === 0) {
    return (
      <div
        data-testid={testId}
        style={{ padding: '24px 16px', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}
      >
        {emptyText}
      </div>
    )
  }

  // ─── Compact: card list ──────────────────────────────────────────────
  if (compact) {
    return (
      <div data-testid={testId} data-variant="cards" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row, i) => {
          const primaryCol = columns.find((c) => c.primary)
          const fieldCols = columns.filter((c) => !c.primary && !c.hideOnCompact)
          return (
            <div
              key={keyOf(row, i)}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                background: '#fff',
                padding: 14,
                cursor: onRowClick ? 'pointer' : 'default',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}
            >
              {primaryCol && (
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, marginBottom: 10, wordBreak: 'break-word' }}>
                  {primaryCol.render ? primaryCol.render(row, i) : row[primaryCol.key]}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                {fieldCols.map((col) => {
                  const value = col.render ? col.render(row, i) : row[col.key]
                  return (
                    <div
                      key={col.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        gridColumn: col.cardFullWidth ? '1 / -1' : 'auto',
                        minWidth: 0,
                      }}
                    >
                      {!col.hideLabelOnCard && (
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textMuted, fontWeight: 600 }}>
                          {col.label}
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: colors.text, wordBreak: 'break-word' }}>{value}</span>
                    </div>
                  )
                })}
              </div>
              {cardActions && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.borderLight}` }}>
                  {cardActions(row, i)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Desktop: table (horizontal scroll container if minWidth set) ─────
  const { style: tableStyleOverride, ...restTableProps } = tableProps
  return (
    <div data-testid={testId} data-variant="table" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: minWidth || 'auto', ...(tableStyleOverride || {}) }}
        {...restTableProps}
      >
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '10px 12px',
                  textAlign: col.align || 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: colors.textLight,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  ...(col.thStyle || {}),
                }}
              >
                {col.label}
              </th>
            ))}
            {cardActions && <th style={{ padding: '10px 12px' }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={keyOf(row, i)}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{ borderBottom: `1px solid ${colors.borderLight}`, cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '10px 12px',
                    textAlign: col.align || 'left',
                    fontSize: 13,
                    color: colors.text,
                    ...(col.tdStyle || {}),
                  }}
                >
                  {col.render ? col.render(row, i) : row[col.key]}
                </td>
              ))}
              {cardActions && (
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>{cardActions(row, i)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
