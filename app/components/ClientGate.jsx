'use client'

import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { colors, fonts, inp, lbl } from '@/lib/styles'
import { noAutofill } from '@/lib/noAutofill'
import { useResponsive } from '@/lib/useIsMobile'
import { useI18n } from '@/lib/i18n'
import { validateVAT, EU_COUNTRIES, guessCountryCode } from '@/lib/vat'
import { lookupCompany } from '@/lib/api'
import { COUNTRIES } from '@/lib/countries'
import LoadingDots from './LoadingDots'
import UserMenu from './UserMenu'

/**
 * Full-screen client identification gate.
 * Search a saved client → fill this page's fields (contact, company, VAT,
 * address, plus remembered DZB / Synalia / shipping for the order form).
 * Does NOT restore past product lines / orders.
 */
export default function ClientGate({ client, setClient, onComplete, onGoHome }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [viesLoading, setViesLoading] = useState(false)
  const [error, setError] = useState('')
  const [viesResult, setViesResult] = useState(null)
  const [perplexityDone, setPerplexityDone] = useState(false)
  const [lookupIncorrect, setLookupIncorrect] = useState(false)
  const [showManualAddress, setShowManualAddress] = useState(false)
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryHi, setCountryHi] = useState(0)
  const [starting, setStarting] = useState(false)
  const [contactConflict, setContactConflict] = useState(null)
  const countryListRef = useRef(null)

  // Client search state
  const [clientSearch, setClientSearch] = useState('')
  const [savedClients, setSavedClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [showSavedClients, setShowSavedClients] = useState(false)
  const searchDebounceRef = useRef(null)
  const clientRequestRef = useRef(0)

  const canLookup = client.company.trim() && client.country.trim()
  const canStart = client.company.trim()

  // Fetch saved clients on mount
  useEffect(() => {
    fetchClients()
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      clientRequestRef.current += 1
    }
  }, [])

  const fetchClients = async (search = '', { autoSelectExact = false } = {}) => {
    const requestId = ++clientRequestRef.current
    setClientsLoading(true)
    try {
      const url = search ? `/api/clients?search=${encodeURIComponent(search)}` : '/api/clients'
      const res = await fetch(url)
      const data = await res.json()
      if (requestId !== clientRequestRef.current) return
      if (data.clients) {
        setSavedClients(data.clients)
        if (autoSelectExact) {
          const companyKey = search.trim().toLowerCase()
          const exactMatches = data.clients.filter(
            (candidate) => (candidate.company || '').trim().toLowerCase() === companyKey,
          )
          if (exactMatches.length === 1) selectSavedClient(exactMatches[0])
        }
      }
    } catch (err) {
      if (requestId !== clientRequestRef.current) return
    } finally {
      if (requestId === clientRequestRef.current) setClientsLoading(false)
    }
  }

  // Debounced search
  const handleClientSearch = (value) => {
    setClientSearch(value)
    setShowSavedClients(true)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      fetchClients(value, { autoSelectExact: true })
    }, 300)
  }

  // Select a saved client — fill this page only (no past-order product lines)
  const selectSavedClient = (savedClient) => {
    const savedVatStatus = savedClient.vat_valid === true ? 'VALID' : savedClient.vat_valid === false ? 'INVALID' : null
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
      vatStatus: savedVatStatus,
      vatErrorCode: null,
      vatMessageKey: null,
      vatValidating: false,
      savedClientId: savedClient.id,
      dzb_client_number: savedClient.dzb_client_number || '',
      jeweler_group: savedClient.jeweler_group || null,
      shipping_same_as_billing: savedClient.shipping_same_as_billing !== false,
      shipping_address: savedClient.shipping_address || '',
      shipping_address_line2: savedClient.shipping_address_line2 || '',
      shipping_country: savedClient.shipping_country || '',
    })
    setShowSavedClients(false)
    setClientSearch('')
    setPerplexityDone(true)
    setShowManualAddress(true)
  }

  // Save current client to DB. Resolves with the contact conflicts the API
  // refused to apply, so the caller can ask the user before overwriting.
  const saveClient = async ({ confirmContactOverwrite = false } = {}) => {
    if (!client.company.trim()) return []
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.savedClientId || undefined,
          ...(confirmContactOverwrite ? { confirm_contact_overwrite: true } : {}),
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
          dzb_client_number: client.dzb_client_number || null,
          jeweler_group: client.jeweler_group || null,
          shipping_same_as_billing: client.shipping_same_as_billing !== false,
          shipping_address: client.shipping_address || null,
          shipping_address_line2: client.shipping_address_line2 || null,
          shipping_country: client.shipping_country || null,
        }),
      })
      const data = await res.json()
      if (data.client) {
        setClient(prev => ({
          ...prev,
          savedClientId: data.client.id,
          dzb_client_number: data.client.dzb_client_number || prev.dzb_client_number || '',
          jeweler_group: data.client.jeweler_group || prev.jeweler_group || null,
          shipping_same_as_billing: data.client.shipping_same_as_billing !== false,
          shipping_address: data.client.shipping_address || prev.shipping_address || '',
          shipping_address_line2: data.client.shipping_address_line2 || prev.shipping_address_line2 || '',
          shipping_country: data.client.shipping_country || prev.shipping_country || '',
        }))
      }
      return data.contact_warnings || []
    } catch (err) {
      return []
    }
  }

  // Fire VAT validation in background
  const startVatValidation = useCallback((vatNumber) => {
    if (!vatNumber || vatNumber.length < 4) return
    setViesLoading(true)
    setClient((prev) => ({ ...prev, vatValidating: true, vatValid: null, vatStatus: null, vatErrorCode: null, vatMessageKey: null }))
    validateVAT(vatNumber)
      .then((viesRes) => {
        setViesResult(viesRes)
        setViesLoading(false)
        setClient((prev) => ({
          ...prev,
          vatValid: viesRes.valid,
          vatStatus: viesRes.status || null,
          vatErrorCode: viesRes.errorCode || null,
          vatMessageKey: viesRes.messageKey || null,
          vatValidating: false,
        }))
      })
      .catch(() => {
        setViesResult({ valid: null, status: 'UNVERIFIED', errorCode: 'NETWORK_ERROR', messageKey: 'vat.unverified.generic' })
        setViesLoading(false)
        setClient((prev) => ({ ...prev, vatValid: null, vatStatus: 'UNVERIFIED', vatErrorCode: 'NETWORK_ERROR', vatMessageKey: 'vat.unverified.generic', vatValidating: false }))
      })
  }, [setClient])

  // Handle the main lookup flow
  const handleLookup = useCallback(async () => {
    if (!canLookup) return
    setLoading(true)
    setError('')
    setViesResult(null)
    setPerplexityDone(false)
    setLookupIncorrect(false)
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

  const handleStart = useCallback(async () => {
    if (!client.company.trim()) {
      onComplete()
      return
    }
    // Auto-save client to DB before starting. The API refuses to replace an
    // existing contact name/email/phone on its own, so a conflict pauses here
    // instead of quietly rewriting the shared client record.
    setStarting(true)
    const warnings = await saveClient()
    setStarting(false)
    if (warnings.length) {
      setContactConflict(warnings)
      return
    }
    onComplete()
  }, [onComplete, client])

  const handleKeepStoredContact = useCallback(() => {
    setContactConflict(null)
    onComplete()
  }, [onComplete])

  const handleReplaceStoredContact = useCallback(async () => {
    setStarting(true)
    await saveClient({ confirmContactOverwrite: true })
    setStarting(false)
    setContactConflict(null)
    onComplete()
  }, [onComplete, client])

  // Compact = phone OR iPad portrait → stacked, larger-target layout.
  const { isCompact: mobile } = useResponsive()

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
    setClient((c) => ({
      ...c,
      country: name,
      address: '',
      city: '',
      zip: '',
      // Only clear vat if it came from a previous lookup. A manually typed
      // VAT should survive a country re-selection.
      ...(perplexityDone ? { vat: '', vatValid: null, vatStatus: null, vatErrorCode: null, vatMessageKey: null } : {}),
    }))
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
      {/* Home button — top-left */}
      {onGoHome && (
        <button
          onClick={onGoHome}
          style={{
            position: 'absolute', top: 16, left: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: mobile ? '10px 14px' : '7px 13px', minHeight: mobile ? 44 : 'auto', borderRadius: 8,
            border: `1px solid ${colors.lineGray}`, background: '#fff',
            color: colors.inkPlum, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: fonts.body,
            boxShadow: '0 1px 4px rgba(93,58,94,0.07)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8L8 2L14 8" stroke={colors.inkPlum} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3.5 6.5V13.5H6.5V10H9.5V13.5H12.5V6.5" stroke={colors.inkPlum} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </button>
      )}

      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <UserMenu />
      </div>

      <img src="/logo.png" alt="LoveLab" style={{ height: mobile ? 80 : 100, width: 'auto', marginBottom: 12 }} />

      <div style={{ fontSize: mobile ? 20 : 24, fontFamily: fonts.heading, color: colors.inkPlum, marginBottom: 4, fontWeight: 600, textAlign: 'center' }}>
        {t('client.title')}
      </div>
      <div style={{ fontSize: mobile ? 13 : 11, color: colors.lovelabMuted, marginBottom: 24, textAlign: 'center' }}>
        {t('client.subtitle')}
      </div>

      {/* Form Card */}
      <div style={{
        background: colors.porcelain, borderRadius: mobile ? 12 : 16, padding: mobile ? 16 : 28,
        width: '100%', maxWidth: mobile ? '100%' : 420, boxShadow: '0 4px 20px rgba(93, 58, 94, 0.08)',
      }}>
        {/* ─── Saved Client Picker ─── */}
        <div style={{ marginBottom: 18 }}>
          <div style={lbl}>{t('client.searchSaved')}</div>
          <div style={{ position: 'relative' }}>
            <input
              value={clientSearch}
              onChange={(e) => handleClientSearch(e.target.value)}
              onFocus={() => { setShowSavedClients(true); if (!clientSearch) fetchClients() }}
              onBlur={() => setTimeout(() => setShowSavedClients(false), 150)}
              placeholder={t('client.searchPlaceholder')}
              style={{ ...inp, width: '100%' }}
              {...noAutofill('q')}
            />
            {showSavedClients && (savedClients.length > 0 || clientsLoading) && (
              <div style={{
                position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)',
                left: 0, right: 0, maxHeight: 200, overflowY: 'auto',
                background: '#fff', border: '1px solid #eaeaea', borderRadius: 10,
                boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: 4,
              }}>
                {clientsLoading ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: '#999', textAlign: 'center' }}>{t('client.searching')}</div>
                ) : savedClients.length === 0 ? (
                  <div style={{ padding: mobile ? '14px 14px' : '10px 12px', fontSize: mobile ? 13 : 12, color: '#999', textAlign: 'center' }}>{t('client.noSaved')}</div>
                ) : (
                  savedClients.map(sc => (
                    <button
                      key={sc.id}
                      onMouseDown={(e) => { e.preventDefault(); selectSavedClient(sc) }}
                      onTouchStart={(e) => { e.currentTarget.style.background = '#f5f3f7' }}
                      onTouchEnd={(e) => { e.currentTarget.style.background = 'transparent' }}
                      style={{
                        width: '100%', textAlign: 'left', padding: mobile ? '14px 14px' : '8px 12px',
                        borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'transparent', fontFamily: 'inherit', fontSize: mobile ? 14 : 12,
                        display: 'flex', flexDirection: 'column', gap: mobile ? 4 : 2,
                        minHeight: mobile ? 56 : 'auto',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f3f7' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontWeight: 600, color: '#333', fontSize: mobile ? 15 : 'inherit' }}>{sc.company}</div>
                      <div style={{ fontSize: mobile ? 12 : 11, color: '#999', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>{t('client.orNew')}</span>
          <div style={{ flex: 1, height: 1, background: '#e3e3e3' }} />
        </div>

        {/* Contact Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>{t('client.contactName')}</div>
          <input
            value={client.name}
            onChange={(e) => setClient((c) => ({ ...c, name: e.target.value }))}
            placeholder={t('client.namePlaceholder')}
            style={{ ...inp, width: '100%' }}
            {...noAutofill('f1')}
          />
        </div>

        {/* Phone & Email */}
        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>{t('client.phone')}</div>
            <input
              value={client.phone}
              onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))}
              placeholder={t('client.phonePlaceholder')}
              type="tel"
              style={{ ...inp, width: '100%' }}
              {...noAutofill('f2')}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={lbl}>{t('client.email')}</div>
            <input
              value={client.email}
              onChange={(e) => setClient((c) => ({ ...c, email: e.target.value }))}
              placeholder={t('client.emailPlaceholder')}
              type="email"
              style={{ ...inp, width: '100%' }}
              {...noAutofill('f3')}
            />
          </div>
        </div>

        {/* Company Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>{t('client.companyName')}</div>
          <input
            value={client.company}
            onChange={(e) => {
              // Never wipe manually typed address on every keystroke — that made
              // the New Client form feel like it "deleted everything". Only clear
              // lookup-derived address/VAT after a completed lookup, when the
              // company name actually changes.
              const nextCompany = e.target.value
              setClient((c) => {
                const companyChanged = nextCompany.trim() !== (c.company || '').trim()
                if (perplexityDone && companyChanged) {
                  return {
                    ...c,
                    company: nextCompany,
                    address: '',
                    city: '',
                    zip: '',
                    vat: '',
                    vatValid: null,
                    vatStatus: null,
                    savedClientId: null,
                  }
                }
                return {
                  ...c,
                  company: nextCompany,
                  // Editing the company name detaches from the saved client record
                  ...(companyChanged ? { savedClientId: null } : {}),
                }
              })
              if (perplexityDone) {
                setViesResult(null)
                setPerplexityDone(false)
              }
              // Typing a complete, already-saved company name should behave
              // exactly like selecting it from Search Saved Clients. Only one
              // exact match is accepted, so partial/new company names are
              // never overwritten by a fuzzy result.
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
              if (nextCompany.trim()) {
                searchDebounceRef.current = setTimeout(() => {
                  fetchClients(nextCompany, { autoSelectExact: true })
                }, 300)
              }
            }}
            aria-required="true"
            aria-label={t('client.companyName')}
            placeholder={t('client.companyPlaceholder')}
            style={{ ...inp, width: '100%' }}
            {...noAutofill('f4')}
          />
        </div>

        {/* Country */}
        <div style={{ marginBottom: 14 }}>
          <div style={lbl}>{t('client.country')}</div>
          <div style={{ position: 'relative' }}>
            <input
              value={client.country}
              aria-required="true"
              aria-label={t('client.country')}
              aria-expanded={countryOpen}
              role="combobox"
              aria-autocomplete="list"
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
              placeholder={t('client.selectCountry')}
              style={{ ...inp, width: '100%' }}
              {...noAutofill('f5')}
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
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#999' }}>{t('client.noMatches')}</div>
                ) : (
                  filteredCountries.map((name, idx) => (
                    <button
                      key={name}
                      type="button"
                      data-idx={idx}
                      onClick={() => selectCountry(name)}
                      onMouseEnter={() => setCountryHi(idx)}
                      style={{
                        width: '100%', textAlign: 'left', padding: mobile ? '12px 12px' : '8px 10px',
                        minHeight: mobile ? 44 : 'auto',
                        borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: idx === countryHi ? 'rgba(93, 58, 94, 0.10)' : 'transparent',
                        color: '#333', fontFamily: 'inherit', fontSize: mobile ? 14 : 12,
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
          <div style={lbl}>{t('client.vatNumber')}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={client.vat}
              onChange={(e) => {
                setClient((c) => ({ ...c, vat: e.target.value, vatValid: null, vatStatus: null, vatErrorCode: null, vatMessageKey: null }))
                setViesResult(null)
              }}
              placeholder={t('client.vatPlaceholder')}
              style={{ ...inp, flex: 1 }}
              {...noAutofill('f6')}
            />
            {viesLoading && <div style={{ width: 28, display: 'flex', justifyContent: 'center' }}><LoadingDots /></div>}
            {!viesLoading && viesResult && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: (viesResult.status === 'VALID' || viesResult.valid === true)
                  ? '#d4edda'
                  : (viesResult.status === 'UNVERIFIED' || viesResult.valid === null)
                    ? '#fff3cd'
                    : '#f8d7da',
                color: (viesResult.status === 'VALID' || viesResult.valid === true)
                  ? '#155724'
                  : (viesResult.status === 'UNVERIFIED' || viesResult.valid === null)
                    ? '#856404'
                    : '#721c24',
                fontSize: 14, fontWeight: 700,
              }}>
                {(viesResult.status === 'VALID' || viesResult.valid === true)
                  ? '✓'
                  : (viesResult.status === 'UNVERIFIED' || viesResult.valid === null)
                    ? '?'
                    : '✗'}
              </div>
            )}
            {perplexityDone && !viesLoading && !viesResult && client.vat.trim().length >= 4 && (
              <button onClick={handleVerifyVat} style={{ padding: mobile ? '10px 16px' : '6px 12px', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: mobile ? 12 : 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: mobile ? 44 : 'auto' }}>{t('client.verify')}</button>
            )}
          </div>
          {viesResult && (viesResult.status === 'INVALID' || viesResult.status === 'UNVERIFIED' || viesResult.valid === false || viesResult.valid === null) && (
            <div style={{
              fontSize: 10,
              color: (viesResult.status === 'UNVERIFIED' || viesResult.valid === null) ? '#856404' : '#c44',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>{t(viesResult.messageKey || ((viesResult.status === 'INVALID' || viesResult.valid === false) ? 'vat.numberNotFound' : 'vat.unverified.generic'))}</span>
              {(viesResult.status === 'UNVERIFIED' || viesResult.valid === null) && !viesLoading && (
                <button onClick={handleVerifyVat} style={{ padding: mobile ? '8px 14px' : '2px 8px', borderRadius: 4, border: 'none', background: colors.inkPlum, color: '#fff', fontSize: mobile ? 11 : 9, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: mobile ? 36 : 'auto' }}>{t('client.retry')}</button>
              )}
            </div>
          )}
          {viesResult && viesResult.valid && viesResult.name && (
            <div style={{ fontSize: 10, color: '#155724', marginTop: 4 }}>VIES: {viesResult.name}</div>
          )}
          <a
            href="https://ec.europa.eu/taxation_customs/vies/#/vat-validation"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: '#666', textDecoration: 'underline', marginTop: 6, display: 'inline-block' }}
          >
            {t('client.checkVatManually')}
          </a>
        </div>

        {/* Manual Address Entry Toggle */}
        {!perplexityDone && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowManualAddress(!showManualAddress)}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: colors.inkPlum, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {showManualAddress ? '▼' : '▶'} {t('client.enterAddressManually') || 'Enter address manually'}
            </button>
            {showManualAddress && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input 
                  value={client.address} 
                  onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))} 
                  placeholder={t('client.address')} 
                  style={{ ...inp, flex: '2 1 120px', fontSize: 11, padding: '8px 10px' }} 
                  {...noAutofill('f7')}
                />
                <input 
                  value={client.city} 
                  onChange={(e) => setClient((c) => ({ ...c, city: e.target.value }))} 
                  placeholder={t('client.city')} 
                  style={{ ...inp, flex: '1 1 80px', fontSize: 11, padding: '8px 10px' }} 
                  {...noAutofill('f8')}
                />
                <input 
                  value={client.zip} 
                  onChange={(e) => setClient((c) => ({ ...c, zip: e.target.value }))} 
                  placeholder={t('client.zip')} 
                  style={{ ...inp, flex: '0 1 60px', fontSize: 11, padding: '8px 10px' }} 
                  {...noAutofill('f9')}
                />
              </div>
            )}
          </div>
        )}

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
          {loading ? (<><LoadingDots /> {t('client.lookingUp')}</>) : t('client.lookUp')}
        </button>

        {error && <div style={{ fontSize: 11, color: '#c44', marginBottom: 10, textAlign: 'center' }}>{error}</div>}

        {/* Results section */}
        {perplexityDone && (
          <div style={{ background: lookupIncorrect ? '#fef2f2' : colors.ice, borderRadius: 10, padding: 14, marginBottom: 14, border: lookupIncorrect ? '1px solid #fecaca' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.companyDetails')}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={lookupIncorrect}
                  onChange={(e) => {
                    setLookupIncorrect(e.target.checked)
                    if (e.target.checked) {
                      setClient((c) => ({ ...c, address: '', city: '', zip: '', vat: '' }))
                      setViesResult(null)
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: 10, color: lookupIncorrect ? '#dc2626' : '#666' }}>{t('client.incorrect') || 'Incorrect'}</span>
              </label>
            </div>
            {!lookupIncorrect && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input value={client.address} onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))} placeholder={t('client.address')} style={{ ...inp, flex: '2 1 120px', fontSize: 11, padding: '6px 8px' }} {...noAutofill('f10')} />
                <input value={client.city} onChange={(e) => setClient((c) => ({ ...c, city: e.target.value }))} placeholder={t('client.city')} style={{ ...inp, flex: '1 1 80px', fontSize: 11, padding: '6px 8px' }} {...noAutofill('f11')} />
                <input value={client.zip} onChange={(e) => setClient((c) => ({ ...c, zip: e.target.value }))} placeholder={t('client.zip')} style={{ ...inp, flex: '0 1 60px', fontSize: 11, padding: '6px 8px' }} {...noAutofill('f12')} />
              </div>
            )}
            {lookupIncorrect && (
              <div style={{ fontSize: 11, color: '#dc2626', fontStyle: 'italic' }}>
                {t('client.incorrectHint') || 'Data cleared. You can enter details manually in the order form.'}
              </div>
            )}
          </div>
        )}

        {/* Confirm a saved client was loaded into the fields above */}
        {client?.savedClientId && client?.company && (
          <div style={{
            marginBottom: 14, padding: '10px 12px', borderRadius: 10,
            background: '#f0faf4', border: '1px solid #c6e9d4',
            fontSize: 12, color: '#155724', lineHeight: 1.4,
          }}>
            {t('client.loadedHint') || 'Client loaded — details filled below. Start quoting when ready.'}
          </div>
        )}

        {/* The API kept the stored contact details — let the user decide */}
        {contactConflict && (
          <div style={{
            marginBottom: 14, padding: '12px 14px', borderRadius: 10,
            background: '#fffbeb', border: '1px solid #fcd34d',
            fontSize: 12, color: '#78350f', lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('client.contactConflictTitle')}</div>
            <div style={{ marginBottom: 8 }}>{t('client.contactConflictIntro')}</div>
            {contactConflict.map((conflict) => (
              <div key={conflict.field} style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{t(`client.${conflict.field === 'name' ? 'contactName' : conflict.field}`)}</div>
                <div>{t('client.contactConflictSaved')}: {conflict.stored}</div>
                <div>{t('client.contactConflictEntered')}: {conflict.incoming}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={handleKeepStoredContact}
                disabled={starting}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none',
                  background: colors.inkPlum, color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: starting ? 'default' : 'pointer',
                  fontFamily: 'inherit', minHeight: mobile ? 44 : 'auto',
                }}
              >
                {t('client.contactConflictKeep')}
              </button>
              <button
                onClick={handleReplaceStoredContact}
                disabled={starting}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${colors.lineGray}`, background: '#fff',
                  color: colors.inkPlum,
                  fontSize: 12, fontWeight: 700, cursor: starting ? 'default' : 'pointer',
                  fontFamily: 'inherit', minHeight: mobile ? 44 : 'auto',
                }}
              >
                {t('client.contactConflictReplace')}
              </button>
            </div>
          </div>
        )}

        {/* Start Quoting Button */}
        <button
          onClick={handleStart}
          disabled={!canStart || starting || !!contactConflict}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: canStart ? colors.luxeGold : colors.lineGray,
            color: canStart ? '#fff' : '#999',
            fontSize: 14, fontWeight: 700, cursor: canStart ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {t('client.startQuoting')}
        </button>

        {/* Skip link */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: 'none', color: colors.lovelabMuted, fontSize: mobile ? 13 : 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: mobile ? '10px 16px' : 0, minHeight: mobile ? 44 : 'auto' }}
          >
            {t('client.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
