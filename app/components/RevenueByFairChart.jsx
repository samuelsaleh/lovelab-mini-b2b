'use client'

/**
 * RevenueByFairChart — horizontal bars of team revenue per fair/event.
 *
 * Extracted from TeamDashboard because /admin/organizations/[id] shows only
 * this chart (its tables already cover the per-member view) and already has
 * the stats response in hand. Pure presentation: pass `data` as the
 * `revenue_by_event` array from /api/organizations/[id]/stats.
 */

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { colors } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function RevenueByFairChart({ data = [] }) {
  const { t } = useI18n()

  const rows = (data || []).slice(0, 8).map((e) => ({
    ...e,
    name: e.name?.length > 20 ? e.name.slice(0, 18) + '...' : (e.name || '—'),
  }))

  return (
    <div data-testid="team-revenue-by-event" style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        {t('team.revenueByEvent')}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>{t('team.noData')}</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 42)}>
          <BarChart data={rows} layout="vertical" barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} width={120} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="revenue" name={t('team.col.revenue')} fill={colors.luxeGold} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
