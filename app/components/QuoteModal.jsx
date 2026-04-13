'use client'

import { fmt, today } from '@/lib/utils'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import { COLLECTIONS } from '@/lib/catalog'
import { findPackshot } from '@/lib/packshot-lookup'
import PackshotThumb from './PackshotThumb'

const LABEL_TO_ID = Object.fromEntries(COLLECTIONS.map(c => [c.label, c.id]))

function quoteLinePackshotOpts(ln) {
  const opts = {}
  if (ln.colorName) opts.color = ln.colorName
  if (ln.housing) opts.housing = ln.housing
  if (ln.shape) opts.shape = ln.shape
  if (ln.multiAttached === true) opts.subgroup = 'Attached'
  else if (ln.multiAttached === false) opts.subgroup = 'Detached'
  else if (ln.housing?.startsWith('Bezel ')) opts.subgroup = 'Bezel'
  else if (ln.housing?.startsWith('Prong ') || ln.housing === 'Prong') opts.subgroup = 'Prong'
  return opts
}

// Check if client is Belgian (for 21% VAT)
function isBelgian(client) {
  if (!client) return false
  const country = (client.country || '').toLowerCase().trim()
  const vat = (client.vat || '').toUpperCase().trim()
  return country === 'belgium' || country === 'belgique' || country === 'belgie' || country === 'belgië' || vat.startsWith('BE')
}

export default function QuoteModal({ quote, client, onClose, onFinalize }) {
  const mobile = useIsMobile()
  const { t } = useI18n()
  
  if (!quote) return null
  if (!client) return null // Guard against null client
  const q = quote
  const d = today()
  
  // Calculate Belgian VAT if applicable
  const showBelgianVat = isBelgian(client)
  const vatRate = 0.21
  const vatAmount = showBelgianVat ? Math.round(q.total * vatRate * 100) / 100 : 0
  const totalWithVat = showBelgianVat ? q.total + vatAmount : q.total

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quote preview"
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
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        style={{ 
          background: colors.porcelain, 
          borderRadius: mobile ? '16px 16px 0 0' : 16, 
          width: '100%', 
          maxWidth: mobile ? '100%' : 580, 
          maxHeight: mobile ? '90vh' : '88vh', 
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: mobile ? '20px 16px 0' : '26px 22px 0',
        }}>
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
              fontSize: mobile ? 10 : 8, 
              letterSpacing: '0.25em', 
              color: colors.luxeGold, 
              marginTop: 4,
              fontWeight: 500,
              textTransform: 'uppercase'
            }}>
              {t('quote.title')}
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

          {/* Lines */}
          {mobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(q.lines || []).map((ln, i) => (
                <div key={i} style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 8, padding: '10px 10px 8px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PackshotThumb
                        src={findPackshot(LABEL_TO_ID[ln.product] || ln.product, quoteLinePackshotOpts(ln))}
                        size={36}
                      />
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.charcoal }}>{ln.product}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>{fmt(ln.lineTotal)}</div>
                  </div>
                  <div style={{ fontSize: 10, color: colors.lovelabMuted, lineHeight: 1.5 }}>
                    {[ln.carat, ln.housing, ln.colorName, ln.shape, ln.size].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: colors.charcoal }}>
                    {t('quote.qty')}: <strong>{ln.qty}</strong> · {t('quote.unitPrice')}: <strong>{fmt(ln.unitB2B)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.inkPlum}` }}>
                    {['Photo', t('quote.product'), 'ct', t('quote.housing'), t('quote.color'), t('quote.shape'), t('quote.size'), t('quote.qty'), t('quote.unitPrice'), t('quote.total')].map((h) => (
                      <th key={h} style={{ 
                        padding: '7px 4px', 
                        textAlign: 'left', 
                        fontSize: 8, 
                        fontWeight: 700, 
                        letterSpacing: '0.08em', 
                        textTransform: 'uppercase',
                        color: colors.inkPlum,
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(q.lines || []).map((ln, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                      <td style={{ padding: '7px 4px' }}>
                        <PackshotThumb
                          src={findPackshot(LABEL_TO_ID[ln.product] || ln.product, quoteLinePackshotOpts(ln))}
                          size={32}
                        />
                      </td>
                      <td style={{ padding: '7px 4px', fontWeight: 600, color: colors.charcoal, fontSize: 12, whiteSpace: 'nowrap' }}>{ln.product}</td>
                      <td style={{ padding: '7px 4px', color: colors.charcoal, fontSize: 12 }}>{ln.carat}</td>
                      <td style={{ padding: '7px 4px', fontSize: 10, color: colors.charcoal }}>{ln.housing || '—'}</td>
                      <td style={{ padding: '7px 4px', fontSize: 10, color: colors.charcoal }}>{ln.colorName || '—'}</td>
                      <td style={{ padding: '7px 4px', fontSize: 10, color: colors.charcoal }}>{ln.shape || '—'}</td>
                      <td style={{ padding: '7px 4px', fontSize: 10, color: colors.charcoal }}>{ln.size || '—'}</td>
                      <td style={{ padding: '7px 4px', fontWeight: 600, color: colors.charcoal, fontSize: 12 }}>{ln.qty}</td>
                      <td style={{ padding: '7px 4px', color: colors.charcoal, fontSize: 12 }}>{fmt(ln.unitB2B)}</td>
                      <td style={{ padding: '7px 4px', fontWeight: 700, color: colors.inkPlum, fontSize: 12 }}>{fmt(ln.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
                <span>{t('quote.subtotal')}</span><span style={{ fontWeight: 600 }}>{fmt(q.subtotal)}</span>
              </div>
              {q.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: mobile ? 11 : 12, color: colors.luxeGold }}>
                  <span>{t('quote.discount')} {q.discountPercent}%</span><span>−{fmt(q.discountAmount)}</span>
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
                <span>{t('quote.totalExclVat')}</span><span>{fmt(q.total)}</span>
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
                  <span>{t('quote.totalInclVat')}</span><span>{fmt(totalWithVat)}</span>
                </div>
              )}
              {!showBelgianVat && (
                <div style={{ fontSize: 10, color: colors.lovelabMuted, marginTop: 2 }}>
                  {t('quote.pricesExclVat')}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.lovelabMuted, marginTop: showBelgianVat ? 4 : 0 }}>
                <span>{t('quote.piecesCount').replace('{count}', q.totalPieces)}</span><span>{t('quote.retail')} {fmt(q.totalRetail)}</span>
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
            paddingBottom: 16,
            borderTop: `1px solid ${colors.lineGray}`, 
            fontSize: mobile ? 8 : 9, 
            color: colors.lovelabMuted, 
            textAlign: 'center', 
            lineHeight: 1.7 
          }}>
            THE LOVE GROUP BV · Schupstraat 20, 2018 Antwerp · hello@love-lab.com · www.lovelab.be<br />
            VAT: BE0627515170 · Delivery 4–6 weeks · 18KT gold on request{!showBelgianVat && ' · Prices excl. VAT'}
          </div>
        </div>

        {/* Sticky bottom buttons */}
        <div style={{
          flexShrink: 0,
          padding: mobile ? '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)' : '12px 22px 18px',
          borderTop: `1px solid ${colors.lineGray}`,
          background: colors.porcelain,
        }}>
          {onFinalize && (
            <button
              onClick={onFinalize}
              style={{ 
                width: '100%', 
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
              {t('quote.finalize')}
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
            {t('quote.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
