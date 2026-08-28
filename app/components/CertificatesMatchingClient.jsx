'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Note, Toast, Btn, TableWrap } from './certificates/ui'

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

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="Matching"
        sub={`${certificates.length - needsHuman.length} of ${certificates.length} certificate lines linked to a model`}
      >
        <Btn kind={showAll ? 'on' : undefined} onClick={() => setShowAll((v) => !v)} testId="toggle-all">
          {showAll
            ? `Show certificate lines only (${certificates.length})`
            : `Show every description (${descriptions.length})`}
        </Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}

      <div className="howto">
        <div className="h">
          <i>1</i>
          <div>
            <b>Our own software does not know about serials.</b>
            <span>
              It returns text — <code>IGI 0.05 CERTIFICATE</code>, <code>IGI CUTY 0.20</code> — and
              a piece count. No product code at all.
            </span>
          </div>
        </div>
        <div className="h">
          <i>2</i>
          <div>
            <b>So a person links each description to a model, once.</b>
            <span>A computer cannot guess that <code>IGI 0.05 CERTIFICATE</code> and LGAJ6529 are the same thing.</span>
          </div>
        </div>
        <div className="h">
          <i>3</i>
          <div>
            <b>After that the shelf figure arrives on its own.</b>
            <span>Every night the app reads our software, follows the link, and updates the right model.</span>
          </div>
        </div>
        <div className="h">
          <i>4</i>
          <div>
            <b>Names can change freely afterwards.</b>
            <span>The link is made on the serial, so renaming a model on either side never breaks it.</span>
          </div>
        </div>
      </div>

      {needsHuman.length > 0 && (
        <Note warn>
          <strong>
            {needsHuman.length} certificate line{needsHuman.length > 1 ? 's need' : ' needs'} a model.
          </strong>{' '}
          Until then {needsHuman.length > 1 ? 'those models have' : 'that model has'} no shelf figure.
        </Note>
      )}

      <Card flush>
        <TableWrap>
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Description in our software</th>
                <th className="num">On the shelf</th>
                <th>What it is</th>
                <th>Model</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const unlinked = d.kind === 'certificate' && !d.model_id
                return (
                  <tr key={d.description} data-testid="matching-row">
                    <td className="mono" style={{ color: 'var(--ink)' }}>{d.description}</td>
                    <td className="num">{d.total_pcs == null ? '—' : formatQty(d.total_pcs)}</td>
                    <td>
                      <select
                        value={d.kind}
                        disabled={savingKey === d.description}
                        onChange={(e) => save(d.description, { kind: e.target.value })}
                        data-testid="kind-select"
                        style={{ width: 165 }}
                      >
                        {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                      </select>
                    </td>
                    <td>
                      {d.kind !== 'certificate' ? (
                        <span className="spec">not an IGI certificate</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            value={d.model_id || ''}
                            disabled={savingKey === d.description}
                            onChange={(e) => save(d.description, { model_id: e.target.value || null })}
                            data-testid="model-select"
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
                    <td className="mono">
                      {d.last_seen_at ? formatDate(d.last_seen_at.slice(0, 10)) : 'not yet read'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', maxWidth: 720, lineHeight: 1.6 }}>
        A description is matched on its exact text. Our software already holds two spellings —{' '}
        <code>IGI MULTIFIVE0.25</code> and <code>IGI MULTIFIVE 0.50</code> — so the app never tries
        to guess past a small difference. If a description is renamed upstream it appears here as a
        new line needing a human, and the old model keeps its last known figure rather than dropping
        to zero.
      </p>
    </>
  )
}
