import { useState, useCallback } from 'react'
import { colors, fonts, inp, lbl, isMobile } from '../lib/styles'
import { validateVAT, EU_COUNTRIES, guessCountryCode } from '../lib/vat'
import { lookupCompany } from '../lib/api'
import LoadingDots from './LoadingDots'

/**
 * Full-screen client identification gate.
 * User enters name, company, country, and optionally VAT.
 * On submit: VIES and Perplexity run in parallel if VAT is provided,
 * otherwise Perplexity runs alone and may find a VAT to auto-validate.
 */
export default function ClientGate({ client, setClient, onComplete }) {
  const [loading, setLoading] = useState(false)
  const [viesLoading, setViesLoading] = useState(false)
  const [error, setError] = useState('')
  const [viesResult, setViesResult] = useState(null) // { valid, name, address, error }
  const [perplexityDone, setPerplexityDone] = useState(false)

  const canLookup = client.company.trim() && client.country.trim()
  const canStart = client.company.trim()

  // Handle the main lookup flow
  const handleLookup = useCallback(async () => {
    if (!canLookup) return
    setLoading(true)
    setError('')
    setViesResult(null)
    setPerplexityDone(false)

    const hasVat = client.vat.trim().length >= 4

    try {
      if (hasVat) {
        // VAT provided: run VIES and Perplexity in parallel
        setViesLoading(true)
        const [viesRes, perplexityRes] = await Promise.all([
          validateVAT(client.vat.trim()),
          lookupCompany(client.company.trim(), client.country.trim()),
        ])

        // Update client with Perplexity results
        setClient((prev) => ({
          ...prev,
          address: perplexityRes.address || prev.address,
          city: perplexityRes.city || prev.city,
          zip: perplexityRes.zip || prev.zip,
          // Don't overwrite VAT if user already provided one
        }))

        // Show VIES result
        setViesResult(viesRes)
        setViesLoading(false)
        setPerplexityDone(true)

        // Update client VAT validity
        setClient((prev) => ({
          ...prev,
          vatValid: viesRes.valid,
        }))

      } else {
        // No VAT: run Perplexity only
        const perplexityRes = await lookupCompany(client.company.trim(), client.country.trim())

        // Update client with results
        setClient((prev) => ({
          ...prev,
          address: perplexityRes.address || prev.address,
          city: perplexityRes.city || prev.city,
          zip: perplexityRes.zip || prev.zip,
          vat: perplexityRes.vat || prev.vat,
        }))

        setPerplexityDone(true)

        // If Perplexity found a VAT, auto-validate with VIES
        if (perplexityRes.vat) {
          setViesLoading(true)
          const viesRes = await validateVAT(perplexityRes.vat)
          setViesResult(viesRes)
          setViesLoading(false)
          setClient((prev) => ({
            ...prev,
            vatValid: viesRes.valid,
          }))
        }
      }
    } catch (err) {
      setError('Lookup failed. Please try again or enter details manually.')
    }

    setLoading(false)
  }, [client.company, client.country, client.vat, canLookup, setClient])

  // Manual VIES verification (when user types VAT after Perplexity didn't find one)
  const handleVerifyVat = useCallback(async () => {
    if (!client.vat.trim() || client.vat.trim().length < 4) return
    setViesLoading(true)
    setViesResult(null)

    try {
      const viesRes = await validateVAT(client.vat.trim())
      setViesResult(viesRes)
      setClient((prev) => ({
        ...prev,
        vatValid: viesRes.valid,
      }))
    } catch {
      setViesResult({ valid: false, error: 'Verification failed' })
    }

    setViesLoading(false)
  }, [client.vat, setClient])

  // Skip gate entirely
  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  // Complete the gate
  const handleStart = useCallback(() => {
    onComplete()
  }, [onComplete])

  const mobile = isMobile()

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.lovelabBg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: mobile ? 16 : 24,
      fontFamily: fonts.body,
    }}>
      {/* Logo */}
      <img
        src="/logo.png"
        alt="LoveLab"
        style={{ height: mobile ? 80 : 100, width: 'auto', marginBottom: 12 }}
      />

      {/* Title */}
      <div style={{
        fontSize: mobile ? 20 : 24,
        fontFamily: fonts.heading,
        color: colors.inkPlum,
        marginBottom: 4,
        fontWeight: 600,
        textAlign: 'center',
      }}>
        B2B Quote Assistant
      </div>
      <div style={{
        fontSize: 11,
        color: colors.lovelabMuted,
        marginBottom: 24,
        textAlign: 'center',
      }}>
        Enter client details to start building a quote
      </div>

      {/* Form Card */}
      <div style={{
        background: colors.porcelain,
        borderRadius: 16,
        padding: mobile ? 20 : 28,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 4px 20px rgba(93, 58, 94, 0.08)',
      }}>
        {/* Contact Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Contact Name</div>
          <input
            value={client.name}
            onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))}
            placeholder="John Smith"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        {/* Company Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Company Name *</div>
          <input
            value={client.company}
            onChange={(e) => setClient((c) => ({ ...c, company: e.target.value }))}
            placeholder="Acme Jewelry BV"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        {/* Country */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Country *</div>
          <input
            value={client.country}
            onChange={(e) => setClient((c) => ({ ...c, country: e.target.value }))}
            placeholder="Belgium"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        {/* VAT Number */}
        <div style={{ marginBottom: 18 }}>
          <div style={lbl}>VAT Number (optional)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={client.vat}
              onChange={(e) => {
                setClient((c) => ({ ...c, vat: e.target.value, vatValid: null }))
                setViesResult(null)
              }}
              placeholder="BE0123456789"
              style={{ ...inp, flex: 1 }}
            />
            {/* VIES status indicator */}
            {viesLoading && (
              <div style={{ width: 28, display: 'flex', justifyContent: 'center' }}>
                <LoadingDots />
              </div>
            )}
            {!viesLoading && viesResult && (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: viesResult.valid ? '#d4edda' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#fff3cd' : '#f8d7da',
                color: viesResult.valid ? '#155724' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#856404' : '#721c24',
                fontSize: 14,
                fontWeight: 700,
              }}>
                {viesResult.valid ? '✓' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '!' : '✗'}
              </div>
            )}
            {/* Manual verify button if Perplexity ran but no VIES yet and user has typed VAT */}
            {perplexityDone && !viesLoading && !viesResult && client.vat.trim().length >= 4 && (
              <button
                onClick={handleVerifyVat}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: colors.inkPlum,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Verify
              </button>
            )}
          </div>
          {viesResult && !viesResult.valid && viesResult.error && (
            <div style={{ 
              fontSize: 10, 
              color: viesResult.error.includes('busy') || viesResult.error.includes('unavailable') ? '#856404' : '#c44', 
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>{viesResult.error}</span>
              {(viesResult.error.includes('busy') || viesResult.error.includes('unavailable')) && !viesLoading && (
                <button
                  onClick={handleVerifyVat}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: 'none',
                    background: colors.inkPlum,
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {viesResult && viesResult.valid && viesResult.name && (
            <div style={{ fontSize: 10, color: '#155724', marginTop: 4 }}>
              VIES: {viesResult.name}
            </div>
          )}
        </div>

        {/* Lookup Button */}
        <button
          onClick={handleLookup}
          disabled={!canLookup || loading}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: 'none',
            background: canLookup && !loading ? colors.inkPlum : colors.lineGray,
            color: canLookup && !loading ? '#fff' : '#999',
            fontSize: 14,
            fontWeight: 700,
            cursor: canLookup && !loading ? 'pointer' : 'default',
            fontFamily: 'inherit',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {loading ? (
            <>
              <LoadingDots /> Looking up...
            </>
          ) : (
            'Look Up Company'
          )}
        </button>

        {error && (
          <div style={{ fontSize: 11, color: '#c44', marginBottom: 10, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Results section -- shown after lookup */}
        {perplexityDone && (
          <div style={{
            background: colors.ice,
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Company Details
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input
                value={client.address}
                onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))}
                placeholder="Address"
                style={{ ...inp, flex: '2 1 120px', fontSize: 11, padding: '6px 8px' }}
              />
              <input
                value={client.city}
                onChange={(e) => setClient((c) => ({ ...c, city: e.target.value }))}
                placeholder="City"
                style={{ ...inp, flex: '1 1 80px', fontSize: 11, padding: '6px 8px' }}
              />
              <input
                value={client.zip}
                onChange={(e) => setClient((c) => ({ ...c, zip: e.target.value }))}
                placeholder="ZIP"
                style={{ ...inp, flex: '0 1 60px', fontSize: 11, padding: '6px 8px' }}
              />
            </div>
          </div>
        )}

        {/* Start Quoting Button */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: 'none',
            background: canStart ? colors.luxeGold : colors.lineGray,
            color: canStart ? '#fff' : '#999',
            fontSize: 14,
            fontWeight: 700,
            cursor: canStart ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          Start Quoting
        </button>

        {/* Skip link */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              color: colors.lovelabMuted,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textDecoration: 'underline',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
