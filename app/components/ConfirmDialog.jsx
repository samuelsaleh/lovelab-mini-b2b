'use client'

import { colors, fonts, btn } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * Styled confirm/alert dialog to replace native browser dialogs.
 * 
 * @param {{ isOpen: boolean, title: string, message: string, confirmLabel?: string, cancelLabel?: string, onConfirm: () => void, onCancel: () => void, variant?: 'danger' | 'info' }} props
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}) {
  const mobile = useIsMobile()

  if (!isOpen) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: mobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        padding: mobile ? 0 : 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: mobile ? '14px 14px 0 0' : 14,
          padding: mobile ? 20 : 24,
          maxWidth: mobile ? '100%' : 380,
          width: '100%',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          fontFamily: fonts.body,
        }}
      >
        <h3 style={{
          fontSize: mobile ? 17 : 16,
          fontWeight: 700,
          color: variant === 'danger' ? colors.danger : colors.inkPlum,
          marginBottom: 8,
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: mobile ? 14 : 13,
          color: colors.textLight,
          lineHeight: 1.6,
          marginBottom: 20,
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', flexDirection: mobile ? 'column-reverse' : 'row', gap: mobile ? 10 : 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ ...btn.ghost, fontSize: 13, color: '#666', minHeight: mobile ? 48 : 'auto', width: mobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={variant === 'danger'
              ? { ...btn.danger, fontSize: 13, minHeight: mobile ? 48 : 'auto', width: mobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }
              : { ...btn.primary, fontSize: 13, minHeight: mobile ? 48 : 'auto', width: mobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
