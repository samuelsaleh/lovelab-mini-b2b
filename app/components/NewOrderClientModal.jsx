'use client'

/**
 * "New order" — for whom? (Dionne, 15 Sept 2026)
 *
 * A new order used to keep whoever was already loaded, without saying so. At
 * a fair that is usually what you want: the same boutique adds a second order.
 * But it is also how one shop's address rode along onto the next one's order,
 * because nothing on the way through says which boutique you are on.
 *
 * So the question is asked, once, at the only moment it is cheap to answer.
 */

import { useEffect, useRef } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'

export default function NewOrderClientModal({ company, onSameClient, onOtherClient, onCancel }) {
  const { t } = useI18n()
  const sameRef = useRef(null)

  useEffect(() => { sameRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const choice = {
    display: 'block', width: '100%', textAlign: 'left', padding: '13px 15px',
    borderRadius: 10, cursor: 'pointer', fontFamily: fonts.body, marginBottom: 9,
    background: '#fff',
  }
  const title = { display: 'block', fontSize: 14, fontWeight: 700 }
  const hint = { display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.4, color: colors.lovelabMuted }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('newOrder.whoFor')}
        data-testid="new-order-client-modal"
        style={{
          background: '#fff', width: 'min(430px, 100%)', borderRadius: 14, padding: 20,
          fontFamily: fonts.body, boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: colors.inkPlum }}>
          {t('newOrder.whoFor')}
        </h2>

        <button
          ref={sameRef}
          type="button"
          onClick={onSameClient}
          data-testid="new-order-same-client"
          style={{ ...choice, border: `1.5px solid ${colors.inkPlum}` }}
        >
          <span style={{ ...title, color: colors.inkPlum }}>{t('newOrder.sameClient', { company })}</span>
          <span style={hint}>{t('newOrder.sameClientHint')}</span>
        </button>

        <button
          type="button"
          onClick={onOtherClient}
          data-testid="new-order-other-client"
          style={{ ...choice, border: `1.5px solid ${colors.lineGray}` }}
        >
          <span style={{ ...title, color: colors.charcoal }}>{t('newOrder.otherClient')}</span>
          <span style={hint}>{t('newOrder.otherClientHint')}</span>
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '9px 14px', borderRadius: 8, border: 'none', background: 'transparent',
              color: colors.lovelabMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
