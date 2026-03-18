'use client'

import { colors, fonts } from '@/lib/styles'
import { useAuth } from './AuthProvider'
import { useI18n } from '@/lib/i18n'
import ResourcesCard from './ResourcesCard'

/**
 * HomeTab — the clean, client-safe home screen.
 *
 * Shows zero financial data. Private stats are accessible only
 * via UserMenu → "My Account".
 *
 * Props:
 *   onSwitchTab(tabId) — switches the active tab
 */
export default function HomeTab({ onSwitchTab }) {
  const { profile, user } = useAuth()
  const { t } = useI18n()

  const name = profile?.full_name || user?.email?.split('@')[0] || 'there'

  return (
    <div
      data-testid="home-tab"
      style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Welcome heading */}
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: colors.inkPlum,
          margin: '0 0 8px',
          letterSpacing: '-0.02em',
          fontFamily: fonts.body,
        }}>
          {t('home.welcome', { name })}
        </h1>

        {/* New Order button */}
        <button
          data-testid="new-order-button"
          onClick={() => onSwitchTab?.('builder')}
          style={{
            marginTop: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 28px',
            borderRadius: 12,
            border: 'none',
            background: colors.inkPlum,
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: fonts.body,
            transition: 'opacity .15s, transform .1s',
            boxShadow: '0 4px 14px rgba(93,58,94,0.25)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('home.newOrder')}
        </button>

        {/* Resources card */}
        <div style={{ marginTop: 36 }}>
          <ResourcesCard />
        </div>
      </div>
    </div>
  )
}
