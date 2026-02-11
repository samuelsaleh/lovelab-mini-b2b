'use client'

import { colors, fonts, btn } from '@/lib/styles'

export default function Error({ error, reset }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: fonts.body,
      background: colors.bgOff,
      padding: 20,
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 420,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>!</div>
        <h1 style={{
          fontFamily: fonts.heading,
          fontSize: 24,
          color: colors.inkPlum,
          marginBottom: 8,
        }}>
          Something went wrong
        </h1>
        <p style={{
          color: colors.textLight,
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
        <button
          onClick={() => reset()}
          style={{ ...btn.primary, fontSize: 14 }}
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
