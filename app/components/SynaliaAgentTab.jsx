'use client'

import { useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import SynaliaReportCard from './SynaliaReportCard'
import {
  JEWELER_GROUP_OPTIONS,
  getJewelerGroupLabel,
  isSynaliaJewelerGroup,
  jewelerGroupFromLegacy,
  normalizeJewelerGroup,
} from '@/lib/jewelerGroup'

const fmt2 = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return '0,00 €';
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const th = {
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const td = {
  padding: '9px 10px',
  fontSize: 12,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
};

const EXCLUDED = new Set(['internal', 'consignment', 'delete_from_stock', 'sample']);

function isSynalia(doc) {
  return isSynaliaJewelerGroup(jewelerGroupFromLegacy(doc?.metadata));
}

function orderDate(doc) {
  const raw = doc?.metadata?.formState?.date || doc?.created_at;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? new Date(t) : new Date(doc?.created_at || 0);
}

/**
 * Synalia tab — export trimestriel + liste des commandes à marquer Synalia.
 */
export default function SynaliaAgentTab({
  agentId,
  agentName,
  orgDocuments,
  onChangeJewelerGroup,
  togglingDocId,
}) {
  const orders = useMemo(() => {
    return (orgDocuments || [])
      .filter((d) =>
        d.document_type === 'order'
        && d.status === 'sent'
        && !d.deleted_at
        && !EXCLUDED.has(d.order_channel),
      )
      .sort((a, b) => orderDate(b) - orderDate(a));
  }, [orgDocuments]);

  const synaliaCount = orders.filter(isSynalia).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SynaliaReportCard agentId={agentId} agentName={agentName} />

      <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.lineGray}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>Commandes</div>
            <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 2 }}>
              Choisis le groupement du client · {synaliaCount} / {orders.length} commande{synaliaCount !== 1 ? 's' : ''} SYNALIA
            </div>
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{ padding: 20, fontSize: 13, color: colors.lovelabMuted }}>Aucune commande envoyée.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#faf8fc' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Client</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'center' }}>Groupement</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((doc) => {
                  const group = jewelerGroupFromLegacy(doc?.metadata);
                  const flagged = isSynaliaJewelerGroup(group);
                  return (
                    <tr key={doc.id}>
                      <td style={td}>
                        {orderDate(doc).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={td}>{doc.client_company || doc.client_name || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt2(doc.total_amount)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <select
                          value={group}
                          disabled={togglingDocId === doc.id}
                          onChange={(e) => onChangeJewelerGroup(doc.id, normalizeJewelerGroup(e.target.value))}
                          title={flagged ? 'Inclus dans le rapport SYNALIA' : `Groupement: ${getJewelerGroupLabel(group)}`}
                          style={{
                            minWidth: 150,
                            padding: '5px 8px',
                            borderRadius: 6,
                            border: `1px solid ${colors.lineGray}`,
                            background: '#fff',
                            fontSize: 11,
                            fontFamily: fonts.body,
                            cursor: togglingDocId === doc.id ? 'wait' : 'pointer',
                          }}
                        >
                          {JEWELER_GROUP_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
