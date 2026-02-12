'use client'

import { Component } from 'react'
import { colors, fonts, btn } from '@/lib/styles'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console (and to remote error tracking service if configured)
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    // TODO: Send to Sentry/LogRocket/etc. when available:
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error, { extra: errorInfo })
    // }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
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
              An unexpected error occurred. Please try again or refresh the page.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{ ...btn.primary, fontSize: 14 }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ ...btn.secondary, fontSize: 14 }}
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
