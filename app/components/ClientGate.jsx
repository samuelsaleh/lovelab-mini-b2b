'use client'

import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { colors, fonts, inp, lbl, isMobile } from '@/lib/styles'
import { validateVAT, EU_COUNTRIES, guessCountryCode } from '@/lib/vat'
import { lookupCompany } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import LoadingDots from './LoadingDots'
import UserMenu from './UserMenu'

/**
 * Full-screen client identification gate.
 * User can search for saved clients or enter new ones.
 */
export default function ClientGate({ client, setClient, onComplete }) {
  const [loading, setLoading] = useState(false)
  const [viesLoading, setViesLoading] = useState(false)
  const [error, setError] = useState('')
  const [viesResult, setViesResult] = useState(null)
  const [perplexityDone, setPerplexityDone] = useState(false)
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryHi, setCountryHi] = useState(0)
  const countryListRef = useRef(null)

  // Client search state
  const [clientSearch, setClientSearch] = useState('')
  const [savedClients, setSavedClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [showSavedClients, setShowSavedClients] = useState(false)
  const searchDebounceRef = useRef(null)

  const canLookup = client.company.trim() && client.country.trim()
  const canStart = client.company.trim()

  // Fetch saved clients on mount
  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async (search = '') => {
    setClientsLoading(true)
    try {
      const url = search ? `/api/clients?search=${encodeURIComponent(search)}` : '/api/clients'
      const res = await fetch(url)
      const data = await res.json()
      if (data.clients) setSavedClients(data.clients)
    } catch (err) {
      console.error('Error fetching clients:', err)
    }
    setClientsLoading(false)
  }

  // Debounced search
  const handleClientSearch = (value) => {
    setClientSearch(value)
    setShowSavedClients(true)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      fetchClients(value)
    }, 300)
  }

  // Select a saved client
  const selectSavedClient = (savedClient) => {
    setClient({
      name: savedClient.name || '',
      phone: savedClient.phone || '',
      email: savedClient.email || '',
      company: savedClient.company || '',
      country: savedClient.country || '',
      address: savedClient.address || '',
      city: savedClient.city || '',
      zip: savedClient.zip || '',
      vat: savedClient.vat || '',
      vatValid: savedClient.vat_valid,
      vatValidating: false,
      savedClientId: savedClient.id,
    })
    setShowSavedClients(false)
    setClientSearch('')
    setPerplexityDone(true)
  }

  // Save current client to DB
  const saveClient = async () => {
    if (!client.company.trim()) return
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.savedClientId || undefined,
          name: client.name,
          company: client.company,
          country: client.country,
          address: client.address,
          city: client.city,
          zip: client.zip,
          email: client.email,
          phone: client.phone,
          vat: client.vat,
          vat_valid: client.vatValid,
        }),
      })
      const data = await res.json()
      if (data.client) {
        setClient(prev => ({ ...prev, savedClientId: data.client.id }))
      }
    } catch (err) {
      console.error('Error saving client:', err)
    }
  }

  // Fire VAT validation in background
  const startVatValidation = useCallback((vatNumber) => {
    if (!vatNumber || vatNumber.length < 4) return
    setViesLoading(true)
    setClient((prev) => ({ ...prev, vatValidating: true, vatValid: null }))
    validateVAT(vatNumber)
      .then((viesRes) => {
        setViesResult(viesRes)
        setViesLoading(false)
        setClient((prev) => ({ ...prev, vatValid: viesRes.valid, vatValidating: false }))
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
      const perplexityRes = await lookupCompany(client.company.trim(), client.country.trim())
      const foundVat = perplexityRes.vat || ''
      setClient((prev) => ({
        ...prev,
        address: perplexityRes.address || prev.address,
        city: perplexityRes.city || prev.city,
        zip: perplexityRes.zip || prev.zip,
        vat: hasVat ? prev.vat : (foundVat || prev.vat),
      }))
      setPerplexityDone(true)
      setLoading(false)
      const vatForValidation = vatToValidate || foundVat
      if (vatForValidation) startVatValidation(vatForValidation)
    } catch (err) {
      console.error('Company lookup error:', err)
      setError(`Lookup failed: ${err.message || 'Unknown error'}. Please try again or enter details manually.`)
      setLoading(false)
    }
  }, [client.company, client.country, client.vat, canLookup, setClient, startVatValidation])

  const handleVerifyVat = useCallback(() => {
    if (!client.vat.trim() || client.vat.trim().length < 4) return
    setViesResult(null)
    startVatValidation(client.vat.trim())
  }, [client.vat, startVatValidation])

  const handleSkip = useCallback(() => { onComplete() }, [onComplete])

  const handleStart = useCallback(() => {
    // Auto-save client to DB before starting
    if (client.company.trim()) saveClient()
    onComplete()
  }, [onComplete, client])

  const mobile = isMobile()

  const filteredCountries = useMemo(() => {
    const q = (client.country || '').trim().toLowerCase()
    if (!q) return COUNTRIES
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
      minHeight: '100vh', background: colors.lovelabBg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: mobile ? 16 : 24, fontFamily: fonts.body, position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <UserMenu />
      </div>

      <img src="/logo.png" alt="LoveLab" style={{ height: mobile ? 80 : 100, width: 'auto', marginBottom: 12 }} />

      <div style={{ fontSize: mobile ? 20 : 24, fontFamily: fonts.heading, color: colors.inkPlum, marginBottom: 4, fontWeight: 600, textAlign: 'center' }}>
        B2B Quote Assistant
      </div>
      <div style={{ fontSize: 11, color: colors.lovelabMuted, marginBottom: 24, textAlign: 'center' }}>
        Select a saved client or enter new details
      </div>

      {/* Form Card */}
      <div style={{
        background: colors.porcelain, borderRadius: 16, padding: mobile ? 20 : 28,
        width: '100%', maxWidth: 420, boxShadow: '0 4px 20px rgba(93, 58, 94, 0.08)',
      }}>
        {/* ─── Saved Client Picker ─── */}
        <div style={{ marginBottom: 18 }}>
          <div style={lbl}>Search Saved Clients</div>
          <div style={{ position: 'relative' }}>
            <input
              value={clientSearch}
              onChange={(e) => handleClientSearch(e.target.value)}
              onFocus={() => { setShowSavedClients(true); if (!clientSearch) fetchClients() }}
              onBlur={() => setTimeout(() => setShowSavedClients(false), 150)}
              placeholder="Search by company name..."
              style={{ ...inp, width: '100%' }}
            />
            {showSavedClients && (savedClients.length > 0 || clientsLoading) && (
              <div style={{
                position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)',
                left: 0, right: 0, maxHeight: 200, overflowY: 'auto',
                background: '#fff', border: '1px solid #eaeaea', borderRadius: 10,
                boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: 4,
              }}>
                {clientsLoading ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#999', textAlign: 'center' }}>Searching...</div>
                ) : savedClients.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#999', textAlign: 'center' }}>No saved clients found</div>
                ) : (
                  savedClients.map(sc => (
                    <button
                      key={sc.id}
                      onMouseDown={(e) => { e.preventDefault(); selectSavedClient(sc) }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px',
                        borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'transparent', fontFamily: 'inherit', fontSize: 12,
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f3f7' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontWeight: 600, color: '#333' }}>{sc.company}</div>
                      <div style={{ fontSize: 11, color: '#999', display: 'flex', gap: 8 }}>
                        {sc.name && <span>{sc.name}</span>}
                        {sc.country && <span>{sc.country}</span>}
                        {sc.vat && <span style={{ color: sc.vat_valid ? '#27ae60' : '#999' }}>VAT: {sc.vat}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
        }}>
          <div style={{ flex: 1, height: 1, background: '#e3e3e3' }} />
          <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>or enter new client</span>
          <div style={{ flex: 1, height: 1, background: '#e3e3e3' }} />
        </div>

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
              onFocus={() => { setCountryOpen(true); setCountryHi(0); requestAnimationFrame(() => scrollCountryIntoView(0)) }}
              onBlur={() => { setTimeout(() => setCountryOpen(false), 120) }}
              onChange={(e) => {
                setClient((c) => ({ ...c, country: e.target.value }))
                setCountryOpen(true)
                setCountryHi(0)
                requestAnimationFrame(() => scrollCountryIntoView(0))
              }}
              onKeyDown={(e) => {
                if (!countryOpen && (e.key.length === 1 || e.key === 'ArrowDown')) {
                  setCountryOpen(true); setCountryHi(0); requestAnimationFrame(() => scrollCountryIntoView(0)); return
                }
                if (!countryOpen) return
                if (e.key === 'Escape') setCountryOpen(false)
                else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setCountryHi((h) => { const next = Math.min(filteredCountries.length - 1, h + 1); requestAnimationFrame(() => scrollCountryIntoView(next)); return next })
                }
                else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setCountryHi((h) => { const next = Math.max(0, h - 1); requestAnimationFrame(() => scrollCountryIntoView(next)); return next })
                }
                else if (e.key === 'Enter') {
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
                  position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)',
                  left: 0, right: 0, maxHeight: 240, overflowY: 'auto',
                  background: '#fff', border: '1px solid #eaeaea', borderRadius: 10,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.06)', padding: 6,
                }}
                onMouseDown={(e) => { e.preventDefault() }}
              >
                {filteredCountries.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#999' }}>No matches.</div>
                ) : (
                  filteredCountries.map((name, idx) => (
                    <button
                      key={name}
                      type="button"
                      data-idx={idx}
                      onClick={() => selectCountry(name)}
                      onMouseEnter={() => setCountryHi(idx)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 10px',
                        borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: idx === countryHi ? 'rgba(93, 58, 94, 0.10)' : 'transparent',
                        color: '#333', fontFamily: 'inherit', fontSize: 12,
                      }}
                    >{name}</button>
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
            {viesLoading && <div style={{ width: 28, display: 'flex', justifyContent: 'center' }}><LoadingDots /></div>}
            {!viesLoading && viesResult && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: viesResult.valid === true ? '#d4edda' : viesResult.valid === null ? '#fff3cd' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#fff3cd' : '#f8d7da',
                color: viesResult.valid === true ? '#155724' : viesResult.valid === null ? '#856404' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '#856404' : '#721c24',
                fontSize: 14, fontWeight: 700,
              }}>
                {viesResult.valid === true ? '✓' : viesResult.valid === null ? '?' : viesResult.error?.includes('busy') || viesResult.error?.includes('unavailable') ? '!' : '✗'}
              </div>
            )}
            {perplexityDone && !viesLoading && !viesResult && client.vat.trim().length >= 4 && (
              <button onClick={handleVerifyVat} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Verify</button>
            )}
          </div>
          {viesResult && !viesResult.valid && viesResult.error && (
            <div style={{ fontSize: 10, color: viesResult.error.includes('busy') || viesResult.error.includes('unavailable') ? '#856404' : '#c44', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{viesResult.error}</span>
              {(viesResult.error.includes('busy') || viesResult.error.includes('unavailable')) && !viesLoading && (
                <button onClick={handleVerifyVat} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
              )}
            </div>
          )}
          {viesResult && viesResult.valid && viesResult.name && (
            <div style={{ fontSize: 10, color: '#155724', marginTop: 4 }}>VIES: {viesResult.name}</div>
          )}
        </div>

        {/* Lookup Button */}
        <button
          onClick={handleLookup}
          disabled={!canLookup || loading}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: canLookup && !loading ? colors.inkPlum : colors.lineGray,
            color: canLookup && !loading ? '#fff' : '#999',
            fontSize: 14, fontWeight: 700, cursor: canLookup && !loading ? 'pointer' : 'default',
            fontFamily: 'inherit', marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (<><LoadingDots /> Looking up...</>) : 'Look Up Company'}
        </button>

        {error && <div style={{ fontSize: 11, color: '#c44', marginBottom: 10, textAlign: 'center' }}>{error}</div>}

        {/* Results section */}
        {perplexityDone && (
          <div style={{ background: colors.ice, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Details</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input value={client.address} onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))} placeholder="Address" style={{ ...inp, flex: '2 1 120px', fontSize: 11, padding: '6px 8px' }} />
              <input value={client.city} onChange={(e) => setClient((c) => ({ ...c, city: e.target.value }))} placeholder="City" style={{ ...inp, flex: '1 1 80px', fontSize: 11, padding: '6px 8px' }} />
              <input value={client.zip} onChange={(e) => setClient((c) => ({ ...c, zip: e.target.value }))} placeholder="ZIP" style={{ ...inp, flex: '0 1 60px', fontSize: 11, padding: '6px 8px' }} />
            </div>
          </div>
        )}

        {/* Start Quoting Button */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: canStart ? colors.luxeGold : colors.lineGray,
            color: canStart ? '#fff' : '#999',
            fontSize: 14, fontWeight: 700, cursor: canStart ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          Start Quoting
        </button>

        {/* Skip link */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: 'none', color: colors.lovelabMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
