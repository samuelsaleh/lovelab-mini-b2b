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
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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
