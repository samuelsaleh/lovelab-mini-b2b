import './globals.css'
import { AuthProvider } from './components/AuthProvider'
import AuthGuard from './components/AuthGuard'
import { I18nProvider } from '@/lib/i18n'

export const metadata = {
  title: 'LoveLab B2B Quote Calculator',
  description: 'B2B Quote Assistant for LoveLab Antwerp - Munich 2026',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@300;400;500;600&display=swap" 
          rel="stylesheet" 
        />
        {/* The certificate application (/certificates and /igi) is set in
            IBM Plex — a separate typeface for a separate space. */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <I18nProvider>
          <AuthProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
