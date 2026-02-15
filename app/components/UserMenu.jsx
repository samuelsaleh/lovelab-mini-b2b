'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { colors } from '@/lib/styles';
import { useIsMobile } from '@/lib/useIsMobile';
import { useI18n } from '@/lib/i18n';

export default function UserMenu() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { user, profile, loading, signOut } = useAuth();
  const { lang, setLang, languages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when tapping/clicking outside
  // Use 'click' instead of 'mousedown' so that button onClick handlers
  // inside the menu fire before the menu is removed from the DOM.
  // This fixes sign-out on iOS where mousedown fires before click.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    // Use a short delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [open]);

  const displayName = user
    ? (profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User')
    : 'Menu';
  const avatarUrl = user
    ? (profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture)
    : null;
  const initials = user
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '☰';

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: mobile ? '8px 10px' : '4px 8px',
          borderRadius: 8,
          border: 'none',
          background: open ? '#f0f0f0' : 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          minHeight: mobile ? 44 : 'auto',
          minWidth: mobile ? 44 : 'auto',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{
              width: mobile ? 34 : 28,
              height: mobile ? 34 : 28,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: mobile ? 34 : 28,
              height: mobile ? 34 : 28,
              borderRadius: '50%',
              background: colors.inkPlum,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: mobile ? 12 : 11,
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: '#666' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 200,
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {user && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                {displayName}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {user.email}
              </div>
            </div>
          )}

          <button
            onClick={() => { setOpen(false); router.push('/dashboard'); }}
            style={{
              width: '100%',
              padding: mobile ? '14px 16px' : '12px 16px',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              fontSize: 13,
              color: '#333',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid #eee',
              minHeight: mobile ? 48 : 'auto',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {t('docs.allDocuments')}
          </button>

          {/* Language Switcher */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            gap: 4,
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>{t('nav.language')}:</span>
            {languages.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: lang === l.code ? `1.5px solid ${colors.inkPlum}` : '1px solid #e0e0e0',
                  background: lang === l.code ? `${colors.inkPlum}12` : '#fafafa',
                  color: lang === l.code ? colors.inkPlum : '#666',
                  fontSize: 11,
                  fontWeight: lang === l.code ? 700 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>
          
          {user ? (
            <button
              onClick={() => { setOpen(false); signOut(); }}
              style={{
                width: '100%',
                padding: mobile ? '14px 16px' : '12px 16px',
                border: 'none',
                background: mobile ? '#fef2f2' : 'transparent',
                textAlign: 'left',
                fontSize: 13,
                color: '#dc2626',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: mobile ? 48 : 'auto',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
              onMouseLeave={(e) => e.currentTarget.style.background = mobile ? '#fef2f2' : 'transparent'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t('nav.signOut')}
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); router.push('/login'); }}
              style={{
                width: '100%',
                padding: mobile ? '14px 16px' : '12px 16px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontSize: 13,
                color: colors.inkPlum,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: mobile ? 48 : 'auto',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {t('nav.signIn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
