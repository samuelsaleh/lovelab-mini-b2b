'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts, card, btn, inputSm } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import Chip from './igi/Chip'

const KINDS = [
  { id: 'certificate', label: 'IGI certificate' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'in_house', label: 'In-house certificate' },
  { id: 'ignore', label: 'Not a certificate' },
]

/**
 * Linking LoveLab's stock descriptions to the certificate models.
 *
 * This screen exists because LoveLab's software returns free text and a piece
 * count, and nothing else — no product code, no id, no SKU. A computer cannot
 * know that "IGI 0.05 CERTIFICATE" and LGAJ6529 are the same thing.
 */
export default function CertificatesMatchingClient() {
  const { isCompact } = useResponsive()
  const [descriptions, setDescriptions] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [dRes, oRes] = await Promise.all([
        fetch('/api/igi/descriptions'),
        fetch('/api/igi/overview'),
      ])
      const [dBody, oBody] = await Promise.all([dRes.json(), oRes.json()])
      if (!dRes.ok) throw new Error(dBody?.error || 'Failed to load the matching table')
      if (!oRes.ok) throw new Error(oBody?.error || 'Failed to load the models')
      setDescriptions(dBody.descriptions || [])
      setModels((oBody.models || []).filter((m) => m.state === 'in_use'))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function save(description, patch) {
    setSavingKey(description)
    try {
      const res = await fetch('/api/igi/descriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, ...patch }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the link')
      setDescriptions((prev) => prev.map((d) => (
        d.description === description ? { ...d, ...body.description } : d
      )))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingKey(null)
    }
  }

  const certificates = useMemo(
    () => descriptions.filter((d) => d.kind === 'certificate'),
    [descriptions],
  )
  const needsHuman = certificates.filter((d) => !d.model_id)
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  // Unlinked lines first — they are the only ones anyone needs to act on.
  const rows = useMemo(() => {
    const list = showAll ? descriptions : certificates
    return [...list].sort((a, b) => {
      const rank = (d) => (d.kind === 'certificate' && !d.model_id ? 0 : 1)
      return rank(a) - rank(b) || a.description.localeCompare(b.description)
    })
  }, [descriptions, certificates, showAll])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 1180 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        Matching
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        {certificates.length - needsHuman.length} of {certificates.length} certificate lines
        linked to a model.
      </p>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}

      <div style={{ ...card, padding: 16, marginBottom: 18, background: colors.bgOff }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: colors.inkPlum }}>
          Why this screen exists
        </h2>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: colors.textLight, lineHeight: 1.7 }}>
          <li>
            Our own software does not know about serials. It returns text —{' '}
            <code style={code}>IGI 0.05 CERTIFICATE</code>,{' '}
            <code style={code}>IGI CUTY 0.20</code> — and a piece count. No product code at all.
          </li>
          <li>
            So a person links each description to a model, once. A computer cannot guess that{' '}
            <code style={code}>IGI 0.05 CERTIFICATE</code> and LGAJ6529 are the same thing.
          </li>
          <li>
            After that the shelf figure arrives on its own. Every night the app reads our
            software, follows the link, and updates the right model.
          </li>
          <li>
            Names can change freely afterwards. The link is made on the serial, so renaming a
            model on either side never breaks it.
          </li>
        </ol>
      </div>

      {needsHuman.length > 0 && (
        <div style={{ ...banner, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}>
          {needsHuman.length} certificate line{needsHuman.length > 1 ? 's need' : ' needs'} a model.
          Until then {needsHuman.length > 1 ? 'those models have' : 'that model has'} no shelf figure.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          onClick={() => setShowAll((v) => !v)}
          data-testid="toggle-all"
          style={{ ...btn.secondary, padding: '6px 14px', fontSize: 12 }}
        >
          {showAll
            ? `Show certificate lines only (${certificates.length})`
            : `Show every description (${descriptions.length})`}
        </button>
      </div>

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr>
              <th style={th}>Description in our software</th>
              <th style={thNum}>On the shelf</th>
              <th style={th}>What it is</th>
              <th style={th}>Model</th>
              <th style={th}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const unlinked = d.kind === 'certificate' && !d.model_id
              return (
                <tr key={d.description} data-testid="matching-row" style={unlinked ? { background: '#fffdf5' } : undefined}>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                    {d.description}
                  </td>
                  <td style={tdNum}>{d.total_pcs == null ? '—' : formatQty(d.total_pcs)}</td>
                  <td style={td}>
                    <select
                      value={d.kind}
                      disabled={savingKey === d.description}
                      onChange={(e) => save(d.description, { kind: e.target.value })}
                      data-testid="kind-select"
                      style={{ ...inputSm, width: 165 }}
                    >
                      {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    {d.kind !== 'certificate' ? (
                      <span style={{ color: colors.textMuted, fontSize: 12 }}>not an IGI certificate</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={d.model_id || ''}
                          disabled={savingKey === d.description}
                          onChange={(e) => save(d.description, { model_id: e.target.value || null })}
                          data-testid="model-select"
                          style={{ ...inputSm, width: 300 }}
                        >
                          <option value="">— needs a human —</option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.serial} · {modelSpec(m)} · {m.name}
                            </option>
                          ))}
                        </select>
                        {unlinked
                          ? <Chip tone="watch">Needs a human</Chip>
                          : <Chip tone="fine">Linked</Chip>}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: colors.textMuted, whiteSpace: 'nowrap' }}>
                    {d.last_seen_at ? formatDate(d.last_seen_at.slice(0, 10)) : 'not yet read'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: colors.textMuted, maxWidth: 720, lineHeight: 1.6 }}>
        A description is matched on its exact text. Our software already holds two spellings —{' '}
        <code style={code}>IGI MULTIFIVE0.25</code> and <code style={code}>IGI MULTIFIVE 0.50</code>{' '}
        — so the app never tries to guess past a small difference. If a description is renamed
        upstream it appears here as a new line needing a human, and the old model keeps its last
        known figure rather than dropping to zero.
      </p>
    </div>
  )
}

const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.04em', fontWeight: 700, color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'right' }
const td = { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, verticalAlign: 'middle' }
const tdNum = { ...td, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap' }

const code = {
  background: colors.borderLight, padding: '1px 5px', borderRadius: 4,
  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12,
}

const banner = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10,
  fontSize: 13, marginBottom: 16,
}
const dismiss = {
  background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline',
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
