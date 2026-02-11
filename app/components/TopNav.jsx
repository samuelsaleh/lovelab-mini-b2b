'use client'

import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import UserMenu from './UserMenu'

export default function TopNav({ activeTab, onTabChange, client, onEditClient, onNewClient }) {
  const mobile = useIsMobile()
  const { t } = useI18n()
  const hasClient = client && client.company

  const NAV_TABS = [
    { id: 'builder', label: t('nav.builder') },
    { id: 'ai', label: t('nav.ai') },
    { id: 'orderform', label: t('nav.orderform') },
    { id: 'documents', label: t('nav.documents') },
  ]

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #eaeaea',
      flexShrink: 0,
      zIndex: 100,
    }}>
      {/* Top row: logo + client badge + action buttons + user menu */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: mobile ? '8px 12px' : '8px 20px',
        maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <img src="/logo.png" alt="LoveLab" style={{ height: mobile ? 36 : 44, width: 'auto' }} />

        {/* Client info + actions + user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 10 }}>
          {/* Client badge (desktop only - shows company info inline) */}
          {!mobile && hasClient && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f8f8f8', borderRadius: 8, padding: '5px 12px',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum }}>{client.company}</span>
              {client.country && <span style={{ fontSize: 11, color: '#999' }}>{client.country}</span>}
              {client.vatValid === true && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#d4edda', color: '#155724', fontWeight: 600 }}>{t('nav.vatOk')}</span>
              )}
            </div>
          )}

          {/* Desktop: Change Client + New Client buttons */}
          {!mobile && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onEditClient}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${colors.inkPlum}`, background: '#fdf7fa',
                  color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.inkPlum}15` }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fdf7fa' }}
              >
                {hasClient ? t('nav.changeClient') : t('nav.selectClient')}
              </button>
              <button
                onClick={onNewClient}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${colors.lineGray}`, background: '#fff',
                  color: '#666', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
              >
                {t('nav.new')}
              </button>
            </div>
          )}

          {/* Mobile: compact client name badge (tappable) */}
          {mobile && hasClient && (
            <button
              onClick={onEditClient}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#f8f8f8', border: 'none', borderRadius: 8,
                padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
                minHeight: 44,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</span>
              <span style={{ fontSize: 10, color: '#999' }}>&#x25BE;</span>
            </button>
          )}

          <UserMenu />
        </div>
      </div>

      {/* Mobile: client action bar */}
      {mobile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 8px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <button
            onClick={onEditClient}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 12px', borderRadius: 8,
              border: `1.5px solid ${colors.inkPlum}`, background: '#fdf7fa',
              color: colors.inkPlum, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            }}
          >
            {hasClient ? t('nav.changeClient') : t('nav.selectClient')}
          </button>
          <button
            onClick={onNewClient}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 12px', borderRadius: 8,
              border: `1.5px solid ${colors.lineGray}`, background: '#fff',
              color: '#666', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            }}
          >
            {t('nav.newClient')}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Main navigation"
        style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: mobile ? '0 12px' : '0 20px',
          maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box',
          overflowX: 'auto',
        }}
      >
        {NAV_TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              style={{
                padding: mobile ? '14px 16px' : '12px 20px',
                border: 'none',
                borderBottom: isActive ? `2.5px solid ${colors.inkPlum}` : '2.5px solid transparent',
                background: 'transparent',
                color: isActive ? colors.inkPlum : '#888',
                fontSize: mobile ? 12 : 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                fontFamily: fonts.body,
                whiteSpace: 'nowrap',
                transition: 'all .15s',
                minHeight: mobile ? 48 : 'auto',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#555' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#888' }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
