'use client'

import { colors, fonts, btn } from '@/lib/styles'

export default function AgentError({ error, reset }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: fonts.body,
      background: colors.bgOff,
      padding: 40,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 40, marginBottom: 12, color: colors.danger }}>!</div>
        <h2 style={{
          fontFamily: fonts.heading,
          fontSize: 20,
          color: colors.inkPlum,
          margin: '0 0 8px',
        }}>
          Agent portal error
        </h2>
        <p style={{
          color: colors.textLight,
          fontSize: 13,
          lineHeight: 1.6,
          margin: '0 0 20px',
        }}>
          Something went wrong loading this page. Try again or go back to the agent home.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => reset()} style={{ ...btn.primary, fontSize: 13 }}>
            Try Again
          </button>
          <a href="/agent" style={{ ...btn.secondary, fontSize: 13, textDecoration: 'none' }}>
            Back to Agent Home
          </a>
        </div>
      </div>
    </div>
  )
}
