'use client'

import { useRouter, usePathname } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import UserMenu from './UserMenu'
import { useAuth } from './AuthProvider'

/**
 * TopNav — slim top bar (no tab bar; navigation is now in Sidebar).
 *
 * Props:
 *   client         — current client object
 *   onEditClient   — called when "Change Client" is tapped
 *   onNewClient    — called when "+ New Client" is tapped
 *   hideClientBar  — suppress client UI (e.g. on Documents tab)
 *   onOpenSidebar  — called by hamburger icon (mobile only)
 *   onOpenAccount  — passed to UserMenu to open MyAccountPanel
 */
export default function TopNav({ client, onEditClient, onNewClient, hideClientBar, onOpenSidebar, onOpenAccount }) {
  const router = useRouter()
  const pathname = usePathname()
  const mobile = useIsMobile()
  const { t } = useI18n()
  const { user, profile, loading: authLoading } = useAuth()

  const canGoBack = pathname !== '/'

  const hasClient = client && client.company
  const showClientUI = !hideClientBar && onEditClient

  const isAgent = profile?.is_agent && profile?.agent_status === 'active'
  const isAdmin = profile?.role === 'admin'

  const roleLabel = authLoading
    ? 'Loading'
    : isAdmin ? 'Admin'
    : isAgent ? 'Agent'
    : 'Member'

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #eaeaea',
      flexShrink: 0,
      zIndex: 100,
    }}>
      {/* Main row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: mobile ? '8px 12px' : '8px 20px',
        width: '100%', boxSizing: 'border-box',
      }}>
        {/* Left side: hamburger (mobile) + logo (mobile only) + back button (desktop, non-root) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mobile && (
            <button
              data-testid="hamburger-button"
              onClick={onOpenSidebar}
              aria-label={t('nav.openMenu')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: colors.inkPlum,
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                minWidth: 36,
                minHeight: 44,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}

          {/* Logo — only on mobile; desktop Sidebar owns the logo */}
          {mobile && (
            <img src="/logo.png" alt="LoveLab" style={{ height: 44, width: 'auto' }} />
          )}

          {/* Back button — desktop only, shown when not at root */}
          {!mobile && canGoBack && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.lineGray}`,
                background: '#fff',
                color: colors.charcoal,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.lineGray; e.currentTarget.style.color = colors.charcoal }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
              Back
            </button>
          )}
        </div>

        {/* Right side: client badge + buttons + role badge + user menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 10 }}>
          {/* Desktop: company badge */}
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

          {/* Desktop: Change Client + New Client */}
          {showClientUI && !mobile && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onEditClient}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 14px', borderRadius: 8,
                  border: `1.5px solid ${colors.inkPlum}`, background: '#fdf7fa',
                  color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
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
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
              >
                {t('nav.new')}
              </button>
            </div>
          )}

          {/* Mobile: tappable company badge */}
          {showClientUI && mobile && hasClient && (
            <button
              onClick={onEditClient}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#f8f8f8', border: 'none', borderRadius: 8,
                padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.company}</span>
              <span style={{ fontSize: 10, color: '#999' }}>&#x25BE;</span>
            </button>
          )}

          {/* Role badge — desktop only */}
          {user && !mobile && (
            <div
              title="Current signed-in account"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                border: '1px solid #ece7ef', background: '#faf8fc', maxWidth: 260,
              }}
            >
              <span style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: colors.inkPlum,
                background: '#efe7f2', borderRadius: 12, padding: '2px 7px',
                flexShrink: 0, textTransform: 'uppercase',
              }}>
                {roleLabel}
              </span>
            </div>
          )}

          <UserMenu onOpenAccount={onOpenAccount} />
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
    </div>
  )
}
