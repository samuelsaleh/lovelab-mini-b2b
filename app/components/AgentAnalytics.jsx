'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { colors, fonts } from '@/lib/styles'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = (n) => {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const STATUS_COLORS = {
  pending: { bg: '#fff3cd', color: '#856404', label: 'Pending' },
  approved: { bg: '#d1ecf1', color: '#0c5460', label: 'Approved' },
  paid: { bg: '#d4edda', color: '#155724', label: 'Paid' },
  cancelled: { bg: '#f8d7da', color: '#721c24', label: 'Cancelled' },
}

const ITEMS_PER_PAGE = 20

export default function AgentAnalytics() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'orders', 'history', 'payouts'
  const [page, setPage] = useState(0)

  // Contract upload state
  const [contractName, setContractName] = useState(null);
  const [contractUrl, setContractUrl] = useState(null);
  const [contractFile, setContractFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractMsg, setContractMsg] = useState(null);

  useEffect(() => {
    if (authLoading) return
    if (!profile?.is_agent) {
      router.push('/')
      return
    }
    loadData()
  }, [authLoading, profile, router])

  // Reset page when tab changes
  useEffect(() => {
    setPage(0)
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [commRes, payRes, contractRes] = await Promise.all([
        fetch('/api/commissions'),
        fetch('/api/agent-payments'),
        fetch(`/api/agents/${profile.id}/contract`)
      ])
      if (!commRes.ok) throw new Error('Failed to load analytics data')
      const commJson = await commRes.json()
      const payJson = await payRes.json().catch(() => ({ payments: [] }))
      const contractJson = await contractRes.json().catch(() => ({}))
      
      setData(commJson)
      setPayments(payJson.payments || [])
      setContractUrl(contractJson.url || null)
      setContractName(contractJson.name || null)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const monthlyData = useMemo(() => {
    if (!data?.commissions) return []
    const byMonth = {}
    for (const c of data.commissions) {
      if (c.status === 'cancelled') continue
      const d = new Date(c.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { month: key, orders: 0, bonuses: 0 }
      if (c.type === 'bonus') {
        byMonth[key].bonuses += Number(c.commission_amount) || 0
      } else {
        byMonth[key].orders += Number(c.commission_amount) || 0
      }
    }
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map(m => ({
        ...m,
        label: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        orders: Math.round(m.orders),
        bonuses: Math.round(m.bonuses),
      }))
  }, [data])

  const ordersList = useMemo(() => {
    if (!data?.commissions) return []
    return data.commissions.filter(c => c.type === 'order')
  }, [data])

  const currentList = useMemo(() => {
    if (activeTab === 'orders') return ordersList
    if (activeTab === 'history') return data?.commissions || []
    if (activeTab === 'payouts') return payments
    return []
  }, [activeTab, ordersList, data?.commissions, payments])

  const pagedData = useMemo(() => {
    const start = page * ITEMS_PER_PAGE
    return currentList.slice(start, start + ITEMS_PER_PAGE)
  }, [currentList, page])

  const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE)

  if (authLoading || loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading your analytics...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 16, color: colors.danger }}>{error}</div>
        <button onClick={loadData} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  const s = data?.summary || {}
  const ap = data?.agent_profile || {}

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', background: '#fafafa' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: colors.inkPlum, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            My Analytics
          </h1>
          <p style={{ fontSize: 15, color: colors.charcoal, margin: 0, opacity: 0.8 }}>
            Welcome back! Here is an overview of your performance and orders.
          </p>
        </div>

        {/* Inner Tabs */}
        <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${colors.lineGray}`, marginBottom: 24 }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'orders', label: 'My Orders' },
            { id: 'history', label: 'Commission History' },
            { id: 'payouts', label: 'Payouts' }
          ].map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 4px',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? colors.inkPlum : 'transparent'}`,
                  color: isActive ? colors.inkPlum : colors.lovelabMuted,
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginBottom: -1
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <SummaryCard title="Total Earned" value={fmt(s.total_earned)} subtext={`${s.order_count + s.bonus_count} entries`} accent={colors.inkPlum} />
              <SummaryCard title="Total Paid Out" value={fmt(s.total_paid_out || 0)} subtext={`${payments.length} payouts`} accent={colors.success} />
              <SummaryCard title="Pending Balance" value={fmt(s.true_pending_balance || 0)} subtext="awaiting payment" accent={s.true_pending_balance > 0 ? colors.warning : colors.lovelabMuted} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
              {/* Monthly Chart */}
              {monthlyData.length > 0 ? (
                <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20 }}>
                    Monthly Earnings
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthlyData} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} dx={-10} />
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 13, borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }} cursor={{ fill: '#f9f9f9' }} />
                      <Bar dataKey="orders" name="Orders" fill={colors.inkPlum} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bonuses" name="Bonuses" fill={colors.luxeGold} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, padding: '40px', textAlign: 'center', color: colors.lovelabMuted }}>
                  No earnings data yet.
                </div>
              )}

              {/* Conditions Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
                    My Conditions
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: ap.agent_conditions ? 16 : 0 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: '#fdf7fa', color: colors.inkPlum, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                      %
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: colors.inkPlum, lineHeight: 1 }}>{ap.commission_rate || 0}%</div>
                      <div style={{ fontSize: 13, color: colors.lovelabMuted, marginTop: 4 }}>commission rate</div>
                    </div>
                  </div>
                  {ap.agent_conditions && (
                    <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, fontSize: 13, color: colors.charcoal, lineHeight: 1.6, border: `1px solid ${colors.lineGray}` }}>
                      <strong>Additional details:</strong><br />
                      {ap.agent_conditions}
                    </div>
                  )}

                  {/* Contract Upload Section */}
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${colors.lineGray}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                      My Contract
                    </div>
                    {contractUrl ? (
                      <div style={{ background: '#fafafa', borderRadius: 8, border: `1px solid ${colors.lineGray}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.inkPlum} strokeWidth="2">
                          <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {contractName || 'Contract.pdf'}
                          </div>
                        </div>
                        <a href={contractUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none' }}>View</a>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Are you sure you want to remove your contract?')) return;
                            await fetch(`/api/agents/${profile.id}/contract`, { method: 'DELETE' });
                            setContractUrl(null); setContractName(null);
                          }}
                          style={{ fontSize: 12, color: colors.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f && f.size > 10 * 1024 * 1024) { setContractMsg('File too large (max 10MB)'); return; }
                            setContractFile(f || null); setContractMsg(null);
                          }}
                          style={{ fontSize: 13, color: colors.charcoal }}
                        />
                        <button
                          type="button"
                          disabled={!contractFile || contractUploading}
                          onClick={async () => {
                            if (!contractFile) return;
                            setContractUploading(true); setContractMsg(null);
                            const fd = new FormData(); fd.append('file', contractFile);
                            const res = await fetch(`/api/agents/${profile.id}/contract`, { method: 'POST', body: fd });
                            const d = await res.json();
                            if (res.ok) {
                              setContractMsg('Contract uploaded successfully!');
                              const r2 = await fetch(`/api/agents/${profile.id}/contract`);
                              const d2 = await r2.json();
                              setContractUrl(d2.url || null); setContractName(d2.name || null);
                              setContractFile(null);
                            } else { setContractMsg(d.error || 'Upload failed'); }
                            setContractUploading(false);
                          }}
                          style={{ alignSelf: 'flex-start', padding: '8px 16px', background: colors.inkPlum, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!contractFile || contractUploading) ? 0.6 : 1 }}
                        >
                          {contractUploading ? 'Uploading...' : 'Upload Contract (PDF)'}
                        </button>
                        {contractMsg && <div style={{ fontSize: 12, color: contractMsg.includes('failed') || contractMsg.includes('large') ? colors.danger : colors.success }}>{contractMsg}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MY ORDERS */}
        {activeTab === 'orders' && (
          <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              {ordersList.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🛍️</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: colors.charcoal, marginBottom: 8 }}>No orders yet</div>
                  <div style={{ fontSize: 14, color: colors.lovelabMuted }}>Create orders in the Builder to see them here.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Date', 'Client', 'Order Total', 'Rate', 'Your Commission', 'Status'].map(h => (
                          <th key={h} style={{ padding: '16px 20px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedData.map(c => {
                        const st = STATUS_COLORS[c.status] || STATUS_COLORS.pending
                        return (
                          <tr key={c.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 4 }}>
                                {new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 700, color: colors.charcoal }}>{c.document?.client_company || '—'}</div>
                              <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 4 }}>{c.document?.client_name || 'No contact name'}</div>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: colors.charcoal }}>{fmt(c.order_total)}</td>
                            <td style={tdStyle}>
                              <span style={{ display: 'inline-block', background: '#f0f0f0', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                                {c.commission_rate}%
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 800, color: colors.inkPlum, fontSize: 15 }}>{fmt(c.commission_amount)}</td>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: st.bg, color: st.color }}>
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        )}

        {/* TAB: COMMISSION HISTORY */}
        {activeTab === 'history' && (
          <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              {(!data?.commissions || data.commissions.length === 0) ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: colors.charcoal, marginBottom: 8 }}>No commissions yet</div>
                  <div style={{ fontSize: 14, color: colors.lovelabMuted }}>Start creating orders to earn commissions</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Date', 'Type', 'Details', 'Commission', 'Status'].map(h => (
                          <th key={h} style={{ padding: '16px 20px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedData.map(c => {
                        const st = STATUS_COLORS[c.status] || STATUS_COLORS.pending
                        const isBonus = c.type === 'bonus'
                        return (
                          <tr key={c.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={tdStyle}>
                              {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                padding: '4px 8px', borderRadius: 6,
                                background: isBonus ? '#fef3c7' : '#ede9fe',
                                color: isBonus ? '#92400e' : '#5b21b6',
                              }}>
                                {isBonus ? 'Bonus' : 'Order'}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, maxWidth: 300 }}>
                              {isBonus ? (
                                <div style={{ fontWeight: 500, color: colors.charcoal }}>{c.notes || 'Manual Bonus'}</div>
                              ) : (
                                <div>
                                  <div style={{ fontWeight: 600, color: colors.charcoal }}>{c.document?.client_company || c.document?.client_name || '—'}</div>
                                  <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 4 }}>
                                    Order: {fmt(c.order_total)} @ {c.commission_rate}%
                                  </div>
                                </div>
                              )}
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 800, color: isBonus ? colors.luxeGold : colors.inkPlum, fontSize: 15 }}>
                              {isBonus ? '+' : ''}{fmt(c.commission_amount)}
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: st.bg, color: st.color }}>
                                  {st.label}
                                </span>
                                {c.status === 'paid' && c.paid_at && (
                                  <span style={{ fontSize: 10, color: colors.lovelabMuted }}>
                                    on {new Date(c.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        )}

        {/* TAB: PAYOUTS */}
        {activeTab === 'payouts' && (
          <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              {payments.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>💸</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: colors.charcoal, marginBottom: 8 }}>No payouts yet</div>
                  <div style={{ fontSize: 14, color: colors.lovelabMuted }}>When an admin logs a payment, it will appear here.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Date', 'Amount Paid', 'Notes'].map(h => (
                          <th key={h} style={{ padding: '16px 20px', fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', background: '#faf8fc', borderBottom: `1px solid ${colors.lineGray}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedData.map(p => (
                        <tr key={p.id} style={{ transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: colors.success, fontSize: 15 }}>
                            {fmt(p.amount)}
                          </td>
                          <td style={{ ...tdStyle, color: colors.lovelabMuted }}>
                            {p.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
          </div>
        )}

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  )
}

function SummaryCard({ title, value, subtext, accent }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${colors.lineGray}`, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent || colors.inkPlum, marginBottom: 4, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: colors.lovelabMuted, fontWeight: 500 }}>{subtext}</div>
    </div>
  )
}

function PaginationControls({ page, setPage, totalPages }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
      <button
        onClick={() => setPage(p => Math.max(0, p - 1))}
        disabled={page === 0}
        style={pageBtnStyle(page > 0)}
      >
        Previous
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.lovelabMuted, alignSelf: 'center' }}>
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
        style={pageBtnStyle(page < totalPages - 1)}
      >
        Next
      </button>
    </div>
  )
}

const tdStyle = {
  padding: '16px 20px',
  fontSize: 13,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
  verticalAlign: 'middle'
}

const pageBtnStyle = (active) => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: `1px solid ${active ? colors.inkPlum : colors.lineGray}`,
  background: active ? '#fff' : '#f9f9f9',
  color: active ? colors.inkPlum : '#ccc',
  fontSize: 13,
  fontWeight: 700,
  cursor: active ? 'pointer' : 'default',
  fontFamily: fonts.body,
  transition: 'all 0.2s',
  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
})
