'use client'

import { useMemo } from 'react'
import { colors } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export default function DocumentsAnalytics({ filteredDocs, currentEventName, mobile }) {
  const { t } = useI18n()

  // Drafts (parked, unsent orders) are not committed revenue — keep them out
  // of the total and the by-date roll-up.
  const billableDocs = useMemo(() => filteredDocs.filter(d => d.status !== 'draft'), [filteredDocs])

  const currentTotal = useMemo(
    () => billableDocs.reduce((sum, d) => sum + (d.total_amount || 0), 0),
    [billableDocs],
  )

  const salesByDate = useMemo(() => {
    const byDate = {}
    billableDocs.forEach(doc => {
      const key = new Date(doc.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
      if (!byDate[key]) byDate[key] = { count: 0, total: 0 }
      byDate[key].count++
      byDate[key].total += doc.total_amount || 0
    })
    return Object.entries(byDate).sort((a, b) => new Date(b[0]) - new Date(a[0]))
  }, [billableDocs])

  if (billableDocs.length === 0) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f8f5fa 0%, #f3f0f5 100%)',
      borderRadius: 12,
      border: `1px solid ${colors.lineGray}`,
      padding: mobile ? 14 : 16,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: colors.lovelabMuted, fontWeight: 500, marginBottom: 2 }}>
            {currentEventName}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum }}>
            {fmt(currentTotal)}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {salesByDate.length > 0 && (
        <div style={{
          borderTop: `1px solid ${colors.lineGray}`,
          paddingTop: 10,
          marginTop: 4,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: colors.lovelabMuted,
            marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {t('docs.salesByDate') || 'Sales by Date'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {salesByDate.slice(0, 5).map(([date, data]) => (
              <div key={date} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', background: '#fff', borderRadius: 6, fontSize: 12,
              }}>
                <span style={{ color: '#555' }}>{date}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: '#999', fontSize: 11 }}>
                    {data.count} order{data.count !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontWeight: 600, color: colors.inkPlum }}>{fmt(data.total)}</span>
                </div>
              </div>
            ))}
            {salesByDate.length > 5 && (
              <div style={{ fontSize: 10, color: '#999', textAlign: 'center', paddingTop: 4 }}>
                +{salesByDate.length - 5} more days
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
