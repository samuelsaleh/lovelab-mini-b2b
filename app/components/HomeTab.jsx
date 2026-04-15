'use client'

import { useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useAuth } from './AuthProvider'
import { useI18n } from '@/lib/i18n'
import ResourcesCard from './ResourcesCard'
import OrderTypePicker from './OrderTypePicker'
import PackshotGallery from './PackshotGallery'

/**
 * HomeTab — the clean, client-safe home screen.
 *
 * Props:
 *   onSwitchTab(tabId)   — switches the active tab
 *   onCreateOrder(type)  — opens the order form with the given channel type
 */
export default function HomeTab({ onSwitchTab, onCreateOrder }) {
  const { profile, user } = useAuth()
  const { t } = useI18n()
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showGallery, setShowGallery] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const name = profile?.full_name || user?.email?.split('@')[0] || 'there'

  const handleNewOrderClick = () => {
    if (isAdmin) {
      setShowTypePicker(true)
    } else {
      // Agents go straight to the builder (B2B only)
      onCreateOrder?.('b2b')
    }
  }

  return (
    <div
      data-testid="home-tab"
      style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}
    >
      {showTypePicker && (
        <OrderTypePicker
          onSelect={(type) => { setShowTypePicker(false); onCreateOrder?.(type) }}
          onClose={() => setShowTypePicker(false)}
        />
      )}
      {showGallery && (
        <PackshotGallery onClose={() => setShowGallery(false)} />
      )}

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

        {/* Action buttons — all three side by side */}
        <div style={{
          marginTop: 28,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'center',
        }}>
          <button
            data-testid="new-order-button"
            onClick={handleNewOrderClick}
            style={{
              flex: '1 1 160px',
              maxWidth: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              background: colors.inkPlum,
              color: '#fff',
              fontSize: 14,
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

          <button
            onClick={() => setShowGallery(true)}
            style={{
              flex: '1 1 160px',
              maxWidth: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 20px',
              borderRadius: 12,
              border: 'none',
              background: colors.inkPlum,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: fonts.body,
              transition: 'opacity .15s, transform .1s',
              boxShadow: '0 4px 14px rgba(93,58,94,0.25)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            View Product Photos
          </button>

          {isAdmin && (
            <a
              href="https://lovelab.trax-os.com/login"
              target="_blank"
              rel="noreferrer"
              style={{
                flex: '1 1 160px',
                maxWidth: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 20px',
                borderRadius: 12,
                border: 'none',
                background: colors.inkPlum,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: fonts.body,
                textDecoration: 'none',
                transition: 'opacity .15s, transform .1s',
                boxShadow: '0 4px 14px rgba(93,58,94,0.25)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Packshot Studio
            </a>
          )}
        </div>

        {/* Resources card */}
        <div style={{ marginTop: 36 }}>
          <ResourcesCard isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  )
}
