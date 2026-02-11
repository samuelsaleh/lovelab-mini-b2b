import Link from 'next/link'
import { colors, fonts, btn } from '@/lib/styles'

export default function NotFound() {
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
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{
          fontFamily: fonts.heading,
          fontSize: 64,
          color: colors.inkPlum,
          marginBottom: 8,
          lineHeight: 1,
        }}>
          404
        </h1>
        <h2 style={{
          fontSize: 18,
          fontWeight: 600,
          color: colors.text,
          marginBottom: 8,
        }}>
          Page Not Found
        </h2>
        <p style={{
          color: colors.textLight,
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/" style={{
          ...btn.primary,
          fontSize: 14,
          textDecoration: 'none',
        }}>
          Back to Home
        </Link>
      </div>
    </div>
  )
}
