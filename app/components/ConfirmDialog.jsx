'use client'

import { colors, fonts, btn } from '@/lib/styles'

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
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          maxWidth: 380,
          width: '100%',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          fontFamily: fonts.body,
        }}
      >
        <h3 style={{
          fontSize: 16,
          fontWeight: 700,
          color: variant === 'danger' ? colors.danger : colors.inkPlum,
          marginBottom: 8,
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 13,
          color: colors.textLight,
          lineHeight: 1.6,
          marginBottom: 20,
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ ...btn.ghost, fontSize: 13, color: '#666' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={variant === 'danger'
              ? { ...btn.danger, fontSize: 13 }
              : { ...btn.primary, fontSize: 13 }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
