'use client'

import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import UserMenu from './UserMenu'
import { useAuth } from './AuthProvider'

export default function TopNav({ activeTab, onTabChange, client, onEditClient, onNewClient, hideClientBar }) {
  const router = useRouter()
  const mobile = useIsMobile()
  const { t } = useI18n()
  const { user, profile, loading: authLoading, profileError } = useAuth()
  const hasClient = client && client.company
  const showClientUI = !hideClientBar && onEditClient
  const emailLower = (user?.email || '').toLowerCase()
  const isKnownAdminEmail = ['albertosaleh@gmail.com', 'alberto@love-lab.com', 'samuelsaleh@gmail.com'].includes(emailLower)
  const isAgent = profile?.is_agent && profile?.agent_status === 'active'
  const isAdmin = profile?.role === 'admin' || isKnownAdminEmail

  const roleLabel = authLoading
    ? 'Loading'
    : isAdmin
      ? 'Admin'
      : isAgent
        ? 'Agent'
        : 'Member'

  const NAV_TABS = isAgent && !isAdmin
    ? [
        { id: 'builder', label: t('nav.builder') },
        { id: 'analytics', label: t('nav.analytics') || 'Analytics', href: '/analytics' },
        { id: 'reports', label: 'Reports', href: '/reports' },
        { id: 'documents', label: t('nav.documents') },
      ]
    : [
        { id: 'builder', label: t('nav.builder') },
        { id: 'ai', label: t('nav.ai') },
        { id: 'orderform', label: t('nav.orderform') },
        { id: 'documents', label: t('nav.documents') },
        { id: 'analytics', label: t('nav.analytics') || 'Analytics', href: '/analytics' },
        { id: 'reports', label: 'Reports', href: '/reports' },
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
        <img src="/logo.png" alt="LoveLab" style={{ height: mobile ? 48 : 70, width: 'auto' }} />

        {/* Client info + actions + user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 10 }}>
          {/* Client badge (desktop only - shows company info inline) */}
          {showClientUI && !mobile && hasClient && (
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
          {showClientUI && !mobile && (
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
          {showClientUI && mobile && hasClient && (
            <button
              onClick={onEditClient}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#f8f8f8', border: 'none', borderRadius: 8,
                padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
                minHeight: 44,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</span>
              <span style={{ fontSize: 10, color: '#999' }}>&#x25BE;</span>
            </button>
          )}

          {user && !mobile && (
            <div
              title="Current signed-in account"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid #ece7ef',
                background: '#faf8fc',
                maxWidth: 260,
              }}
            >
              <span style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.inkPlum,
                  background: '#efe7f2',
                  borderRadius: 12,
                  padding: '2px 7px',
                  flexShrink: 0,
                  textTransform: 'uppercase',
                }}
              >
                {roleLabel}
              </span>
            </div>
          )}

          <UserMenu />
        </div>
      </div>

      {/* Mobile: client action bar */}
      {showClientUI && mobile && (
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
          padding: mobile ? '0 8px' : '0 20px',
          maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="topnav-tabbar"
      >
        {NAV_TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => tab.href ? router.push(tab.href) : onTabChange(tab.id)}
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
