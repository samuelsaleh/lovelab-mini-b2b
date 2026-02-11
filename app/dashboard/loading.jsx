import { colors, fonts } from '@/lib/styles'

export default function DashboardLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: fonts.body,
      background: colors.bgOff,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40,
          height: 40,
          border: `3px solid ${colors.borderLight}`,
          borderTopColor: colors.inkPlum,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <p style={{
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: 500,
        }}>
          Loading dashboard...
        </p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
