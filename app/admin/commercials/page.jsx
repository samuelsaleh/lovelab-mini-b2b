'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import SalesTeamTabs from '../../components/SalesTeamTabs';
import { isHideRevenue } from '@/lib/utils';

/**
 * Sales Team → Commercials (Sam, 15 Sep 2026).
 *
 * A commercial is a colleague — an admin — who takes orders and earns
 * commission on them. Not an agent: they never appear on the Agents tab. This
 * list shows every commercial with their rate, orders, revenue and what is
 * still owed; the row opens the same follow-up page an agent has (orders,
 * commissions, payments, reports). Someone becomes a commercial on the
 * Employees tab ("Make commercial").
 */

const fmt = (n) => {
  const num = Number(n) || 0;
  if (isHideRevenue()) return '€ ···';
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const STATUS_COLORS = { active: '#16a34a', inactive: '#9ca3af', invited: '#f59e0b' };

function Stat({ label, value, strong }) {
  return (
    <span>
      <span style={{ display: 'block', color: colors.lovelabMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ display: 'block', marginTop: 3, color: strong ? colors.inkPlum : colors.charcoal, fontSize: 14, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

export default function AdminCommercialsPage() {
  const router = useRouter();
  const [commercials, setCommercials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agents');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to load commercials');
        if (!cancelled) setCommercials((data.agents || []).filter((a) => a.is_commercial));
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Failed to load commercials'); setCommercials([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const visible = commercials.filter((c) =>
    !q || (c.full_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', fontFamily: fonts.body, background: '#f8f7fb' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SalesTeamTabs active="commercials" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ flex: '1 1 260px', maxWidth: 360 }}>
            <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Search commercials</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commercials"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${colors.lovelabBorder}`, borderRadius: 10, fontSize: 13, fontFamily: fonts.body, background: '#fff', boxSizing: 'border-box' }}
            />
          </label>
          <button
            type="button"
            onClick={() => router.push('/admin/employees')}
            style={{ padding: '10px 14px', border: `1px solid ${colors.lovelabBorder}`, borderRadius: 10, background: '#fff', color: colors.inkPlum, fontFamily: fonts.body, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Make a colleague commercial → Employees
          </button>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 12 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>Loading commercials...</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13, background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 14 }}>
            {commercials.length === 0
              ? 'No commercials yet. On the Employees tab, "Make commercial" turns a colleague into one: their orders are credited to them and earn commission.'
              : 'No commercials match your search'}
          </div>
        ) : (
          <section aria-labelledby="commercials-heading" style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 14, overflow: 'hidden' }}>
            <h2 id="commercials-heading" style={{ margin: 0, padding: '14px 20px', borderBottom: `1px solid ${colors.lineGray}`, color: colors.inkPlum, fontSize: 15, fontWeight: 700 }}>
              Commercials
            </h2>
            {visible.map((c) => {
              const initials = (c.full_name || c.email || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
              const outstanding = c.stats?.effective_pending_commission ?? c.stats?.pending_commission ?? 0;
              return (
                <article key={c.id} style={{ borderTop: `1px solid ${colors.lineGray}` }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/commercials/${c.id}`)}
                    aria-label={`Open ${c.full_name || c.email || 'commercial'} profile`}
                    style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) repeat(4, minmax(90px, 1fr)) 18px', alignItems: 'center', gap: 16, padding: '18px 20px', border: 'none', background: '#fff', color: colors.charcoal, cursor: 'pointer', textAlign: 'left', fontFamily: fonts.body }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f4edf3', color: colors.inkPlum, fontSize: 12, fontWeight: 700 }}>
                        {initials}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.full_name || c.email || 'Unknown'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, color: colors.lovelabMuted, fontSize: 11 }}>
                          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[c.agent_status] || colors.lovelabMuted }} />
                          <span>{c.agent_status || 'unknown'}</span>
                          <span>· Employee</span>
                        </span>
                      </span>
                    </span>
                    <Stat label="Rate" value={`${Number(c.commission_rate) || 0}%`} strong />
                    <Stat label="Orders" value={c.stats?.effective_orders ?? c.stats?.total_orders ?? 0} />
                    <Stat label="Revenue" value={fmt(c.stats?.effective_revenue ?? c.stats?.total_revenue)} />
                    <Stat label="Outstanding" value={fmt(outstanding)} />
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.lovelabMuted} strokeWidth="1.8">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
