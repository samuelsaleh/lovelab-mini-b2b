'use client'

import { fmt, today } from '@/lib/utils'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'

// Check if client is Belgian (for 21% VAT)
function isBelgian(client) {
  if (!client) return false
  const country = (client.country || '').toLowerCase().trim()
  const vat = (client.vat || '').toUpperCase().trim()
  return country === 'belgium' || country === 'belgique' || country === 'belgie' || country === 'belgië' || vat.startsWith('BE')
}

export default function QuoteModal({ quote, client, onClose, onFinalize }) {
  const mobile = useIsMobile()
  
  if (!quote) return null
  const q = quote
  const d = today()
  
  // Calculate Belgian VAT if applicable
  const showBelgianVat = isBelgian(client)
  const vatRate = 0.21
  const vatAmount = showBelgianVat ? Math.round(q.total * vatRate * 100) / 100 : 0
  const totalWithVat = showBelgianVat ? q.total + vatAmount : q.total

  return (
    <div
      style={{ 
        position: 'fixed', 
        inset: 0, 
        background: 'rgba(74, 37, 69, 0.6)', 
        zIndex: 200, 
        display: 'flex', 
        alignItems: mobile ? 'flex-end' : 'center', 
        justifyContent: 'center', 
        padding: mobile ? 0 : 16 
      }}
      onClick={onClose}
    >
      <div
        style={{ 
          background: colors.porcelain, 
          borderRadius: mobile ? '16px 16px 0 0' : 16, 
          width: '100%', 
          maxWidth: mobile ? '100%' : 580, 
          padding: mobile ? '20px 16px' : '26px 22px', 
          maxHeight: mobile ? '90vh' : '88vh', 
          overflowY: 'auto' 
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          textAlign: 'center', 
          paddingBottom: 16, 
          borderBottom: `1px solid ${colors.lineGray}`, 
          marginBottom: 16 
        }}>
          <img 
            src="/logo.png" 
            alt="LoveLab" 
            style={{ height: mobile ? 40 : 50, width: 'auto', marginBottom: 8 }}
          />
          <div style={{ 
            fontSize: 8, 
            letterSpacing: '0.25em', 
            color: colors.luxeGold, 
            marginTop: 4,
            fontWeight: 500,
            textTransform: 'uppercase'
          }}>
            Antwerp · B2B Quotation
          </div>
          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 8 }}>
            {[client.name, client.company].filter(Boolean).join('  ·  ')}
          </div>
          {(client.address || client.city || client.zip || client.country) && (
            <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 2 }}>
              {[client.address, [client.zip, client.city].filter(Boolean).join(' '), client.country].filter(Boolean).join(', ')}
            </div>
          )}
          {client.vat && (
            <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 2 }}>
              VAT: {client.vat}
            </div>
          )}
          <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 4 }}>
            {d}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: mobile ? 11 : 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.inkPlum}` }}>
                {['Product', 'ct', 'Housing', 'Color', 'Shape', 'Size', 'Qty', 'Unit', 'Total'].map((h) => (
                  <th key={h} style={{ 
                    padding: mobile ? '6px 3px' : '7px 4px', 
                    textAlign: 'left', 
                    fontSize: mobile ? 7 : 8, 
                    fontWeight: 700, 
                    letterSpacing: '0.08em', 
                    textTransform: 'uppercase',
                    color: colors.inkPlum
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.lines || []).map((ln, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontWeight: 600, color: colors.charcoal }}>{ln.product}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', color: colors.charcoal }}>{ln.carat}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontSize: mobile ? 9 : 10, color: colors.charcoal }}>{ln.housing || '—'}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontSize: mobile ? 9 : 10, color: colors.charcoal }}>{ln.colorName || '—'}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontSize: mobile ? 9 : 10, color: colors.charcoal }}>{ln.shape || '—'}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontSize: mobile ? 9 : 10, color: colors.charcoal }}>{ln.size || '—'}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontWeight: 600, color: colors.charcoal }}>{ln.qty}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', color: colors.charcoal }}>{fmt(ln.unitB2B)}</td>
                  <td style={{ padding: mobile ? '6px 3px' : '7px 4px', fontWeight: 700, color: colors.inkPlum }}>{fmt(ln.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ 
          marginTop: 14, 
          paddingTop: 12, 
          borderTop: `2px solid ${colors.inkPlum}`, 
          display: 'flex', 
          justifyContent: 'flex-end' 
        }}>
          <div style={{ minWidth: mobile ? '100%' : 190 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: mobile ? 11 : 12, color: colors.charcoal }}>
              <span>Subtotal</span><span style={{ fontWeight: 600 }}>{fmt(q.subtotal)}</span>
            </div>
            {q.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: mobile ? 11 : 12, color: colors.luxeGold }}>
                <span>Discount {q.discountPercent}%</span><span>−{fmt(q.discountAmount)}</span>
              </div>
            )}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '8px 0 3px', 
              fontSize: mobile ? 14 : 16, 
              fontWeight: 600, 
              borderTop: `1px solid ${colors.lineGray}`, 
              marginTop: 4,
              color: colors.charcoal
            }}>
              <span>Total excl. VAT</span><span>{fmt(q.total)}</span>
            </div>
            {showBelgianVat && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: mobile ? 11 : 12, color: colors.charcoal }}>
                <span>VAT 21%</span><span>{fmt(vatAmount)}</span>
              </div>
            )}
            {showBelgianVat && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '6px 0 3px', 
                fontSize: mobile ? 18 : 20, 
                fontWeight: 800, 
                borderTop: `1px solid ${colors.lineGray}`, 
                marginTop: 4,
                color: colors.inkPlum
              }}>
                <span>Total incl. VAT</span><span>{fmt(totalWithVat)}</span>
              </div>
            )}
            {!showBelgianVat && (
              <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 2 }}>
                Prices excl. VAT (intra-EU / export)
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.lovelabMuted, marginTop: showBelgianVat ? 4 : 0 }}>
              <span>{q.totalPieces} pcs</span><span>Retail {fmt(q.totalRetail)}</span>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {(q.warnings || []).length > 0 && (
          <div style={{ 
            marginTop: 10, 
            padding: '8px 12px', 
            background: colors.ice, 
            borderRadius: 8, 
            border: `1px solid ${colors.lineGray}` 
          }}>
            {q.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 10, color: colors.lovelabMuted }}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ 
          marginTop: 18, 
          paddingTop: 12, 
          borderTop: `1px solid ${colors.lineGray}`, 
          fontSize: mobile ? 8 : 9, 
          color: colors.lovelabMuted, 
          textAlign: 'center', 
          lineHeight: 1.7 
        }}>
          THE LOVE GROUP BV · Schupstraat 20, 2018 Antwerp · hello@love-lab.com · www.lovelab.be<br />
          VAT: BE0627515170 · Delivery 4–6 weeks · 18KT gold on request{!showBelgianVat && ' · Prices excl. VAT'}
        </div>

        {onFinalize && (
          <button
            onClick={onFinalize}
            style={{ 
              width: '100%', 
              marginTop: 14, 
              padding: mobile ? 14 : 11, 
              borderRadius: 10, 
              border: 'none', 
              background: colors.luxeGold, 
              color: '#fff', 
              fontSize: 13, 
              fontWeight: 700, 
              cursor: 'pointer', 
              fontFamily: 'inherit',
              minHeight: mobile ? 48 : 'auto',
              transition: 'opacity .15s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            Finalize My Order
          </button>
        )}

        <button
          onClick={onClose}
          style={{ 
            width: '100%', 
            marginTop: 8, 
            padding: mobile ? 14 : 11, 
            borderRadius: 10, 
            border: 'none', 
            background: colors.inkPlum, 
            color: colors.porcelain, 
            fontSize: 13, 
            fontWeight: 700, 
            cursor: 'pointer', 
            fontFamily: 'inherit',
            minHeight: mobile ? 48 : 'auto',
            transition: 'opacity .15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
