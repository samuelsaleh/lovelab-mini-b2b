'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { colors, fonts, inp, lbl, isMobile } from '@/lib/styles'
import { validateVAT, EU_COUNTRIES, guessCountryCode } from '@/lib/vat'
import { lookupCompany } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import LoadingDots from './LoadingDots'
import UserMenu from './UserMenu'

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
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryHi, setCountryHi] = useState(0)
  const countryListRef = useRef(null)

  const canLookup = client.company.trim() && client.country.trim()
  const canStart = client.company.trim()

  // Fire VAT validation in background (non-blocking)
  const startVatValidation = useCallback((vatNumber) => {
    if (!vatNumber || vatNumber.length < 4) return
    
    setViesLoading(true)
    setClient((prev) => ({ ...prev, vatValidating: true, vatValid: null }))
    
    // Fire and forget - runs in background
    validateVAT(vatNumber)
      .then((viesRes) => {
        setViesResult(viesRes)
        setViesLoading(false)
        setClient((prev) => ({
          ...prev,
          vatValid: viesRes.valid,
          vatValidating: false,
        }))
      })
      .catch(() => {
        setViesResult({ valid: false, error: 'Verification failed' })
        setViesLoading(false)
        setClient((prev) => ({ ...prev, vatValid: false, vatValidating: false }))
      })
  }, [setClient])

  // Handle the main lookup flow
  const handleLookup = useCallback(async () => {
    if (!canLookup) return
    setLoading(true)
    setError('')
    setViesResult(null)
    setPerplexityDone(false)

    const hasVat = client.vat.trim().length >= 4
    const vatToValidate = hasVat ? client.vat.trim() : null

    try {
      // Run Perplexity lookup (blocking - we need the address info)
      const perplexityRes = await lookupCompany(client.company.trim(), client.country.trim())

      // Update client with Perplexity results
      const foundVat = perplexityRes.vat || ''
      setClient((prev) => ({
        ...prev,
        address: perplexityRes.address || prev.address,
        city: perplexityRes.city || prev.city,
        zip: perplexityRes.zip || prev.zip,
        // Only update VAT if user didn't provide one and Perplexity found one
        vat: hasVat ? prev.vat : (foundVat || prev.vat),
      }))

      setPerplexityDone(true)
      setLoading(false)

      // Start VAT validation in background (non-blocking)
      // Use user-provided VAT or Perplexity-found VAT
      const vatForValidation = vatToValidate || foundVat
      if (vatForValidation) {
        startVatValidation(vatForValidation)
      }
    } catch (err) {
      console.error('Company lookup error:', err)
      setError(`Lookup failed: ${err.message || 'Unknown error'}. Please try again or enter details manually.`)
      setLoading(false)
    }
  }, [client.company, client.country, client.vat, canLookup, setClient, startVatValidation])

  // Manual VIES verification (when user types VAT after Perplexity didn't find one)
  const handleVerifyVat = useCallback(() => {
    if (!client.vat.trim() || client.vat.trim().length < 4) return
    setViesResult(null)
    startVatValidation(client.vat.trim())
  }, [client.vat, startVatValidation])

  // Skip gate entirely
  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  // Complete the gate
  const handleStart = useCallback(() => {
    onComplete()
  }, [onComplete])

  const mobile = isMobile()

  const filteredCountries = useMemo(() => {
    const q = (client.country || '').trim().toLowerCase()
    if (!q) return COUNTRIES
    // Prefer prefix matches, then substring matches.
    const prefix = []
    const inside = []
    for (const c of COUNTRIES) {
      const lc = c.toLowerCase()
      if (lc.startsWith(q)) prefix.push(c)
      else if (lc.includes(q)) inside.push(c)
    }
    return [...prefix, ...inside]
  }, [client.country])

  const scrollCountryIntoView = (idx) => {
    const list = countryListRef.current
    if (!list) return
    const el = list.querySelector(`[data-idx="${idx}"]`)
    if (!el) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }

  const selectCountry = (name) => {
    setClient((c) => ({ ...c, country: name, address: '', city: '', zip: '', vat: '', vatValid: null }))
    setViesResult(null)
    setPerplexityDone(false)
    setCountryOpen(false)
  }

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
      position: 'relative',
    }}>
      {/* User menu in top right */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <UserMenu />
      </div>

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
            placeholder="Name"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        {/* Phone & Email */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>Phone</div>
            <input
              value={client.phone}
              onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))}
              placeholder="Phone number"
              type="tel"
              style={{ ...inp, width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={lbl}>Email</div>
            <input
              value={client.email}
              onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))}
              placeholder="Email address"
              type="email"
              style={{ ...inp, width: '100%' }}
            />
          </div>
        </div>

        {/* Company Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Company Name *</div>
          <input
            value={client.company}
            onChange={(e) => {
              // Clear VAT and address when company changes (they're fetched based on company)
              setClient((c) => ({ ...c, company: e.target.value, address: '', city: '', zip: '', vat: '', vatValid: null }))
              setViesResult(null)
              setPerplexityDone(false)
            }}
            placeholder="Company name"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        {/* Country */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>Country *</div>
          <div style={{ position: 'relative' }}>
            <input
              value={client.country}
              onFocus={() => {
                setCountryOpen(true)
                setCountryHi(0)
                requestAnimationFrame(() => scrollCountryIntoView(0))
              }}
              onBlur={() => {
                // Close dropdown when clicking outside.
                setTimeout(() => setCountryOpen(false), 120)
              }}
              onChange={(e) => {
                // Typing updates the filter and keeps dropdown open.
                setClient((c) => ({ ...c, country: e.target.value }))
                setCountryOpen(true)
                setCountryHi(0)
                requestAnimationFrame(() => scrollCountryIntoView(0))
              }}
              onKeyDown={(e) => {
                if (!countryOpen && (e.key.length === 1 || e.key === 'ArrowDown')) {
                  setCountryOpen(true)
                  setCountryHi(0)
                  requestAnimationFrame(() => scrollCountryIntoView(0))
                  return
                }
                if (!countryOpen) return
                if (e.key === 'Escape') {
                  setCountryOpen(false)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setCountryHi((h) => {
                    const next = Math.min(filteredCountries.length - 1, h + 1)
                    requestAnimationFrame(() => scrollCountryIntoView(next))
                    return next
                  })
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setCountryHi((h) => {
                    const next = Math.max(0, h - 1)
                    requestAnimationFrame(() => scrollCountryIntoView(next))
                    return next
                  })
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const pick = filteredCountries[countryHi]
                  if (pick) selectCountry(pick)
                }
              }}
              placeholder="Select country"
              style={{ ...inp, width: '100%' }}
            />

            {countryOpen && (
              <div
                ref={countryListRef}
                style={{
                  position: 'absolute',
                  zIndex: 20,
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  maxHeight: 240,
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #eaeaea',
                  borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
                  padding: 6,
                }}
                onMouseDown={(e) => {
                  // Prevent input blur while clicking options.
                  e.preventDefault()
                }}
              >
                {filteredCountries.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#999' }}>
                    No matches.
                  </div>
                ) : (
                  filteredCountries.map((name, idx) => (
                    <button
                      key={name}
                      type="button"
                      data-idx={idx}
                      onClick={() => selectCountry(name)}
                      onMouseEnter={() => setCountryHi(idx)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        cursor: 'pointer',
                        background: idx === countryHi ? 'rgba(93, 58, 94, 0.10)' : 'transparent',
                        color: '#333',
                        fontFamily: 'inherit',
                        fontSize: 12,
                      }}
                    >
                      {name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
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
              placeholder="VAT number"
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
                background: viesResult.valid === true ? '#d4edda' : 
                            viesResult.valid === null ? '#fff3cd' : // unverified = yellow
                            viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#fff3cd' : '#f8d7da',
                color: viesResult.valid === true ? '#155724' : 
                       viesResult.valid === null ? '#856404' : // unverified = yellow
                       viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#856404' : '#721c24',
                fontSize: 14,
                fontWeight: 700,
              }}>
                {viesResult.valid === true ? '✓' : 
                 viesResult.valid === null ? '?' : // unverified = question mark
                 viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '!' : '✗'}
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
