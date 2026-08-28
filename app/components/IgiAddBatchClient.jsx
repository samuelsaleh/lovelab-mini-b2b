'use client'

import { useState, useEffect } from 'react'
import { colors, fonts, card, btn, inp, lbl } from '@/lib/styles'
import { useResponsive } from '@/lib/useIsMobile'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import { brusselsToday } from '@/lib/igi/dates'

/**
 * Recording a production run. Model, date, reference, quantity, save.
 *
 * That is the whole page on purpose. IGI's stock is the sum of these batches
 * rather than a number somebody edits, so nothing here overwrites anything —
 * which is also why there is no way to change or remove one afterwards. A
 * mistake is corrected by adding a correcting batch, and the trail survives.
 */
export default function IgiAddBatchClient() {
  const { isCompact } = useResponsive()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [modelId, setModelId] = useState('')
  const [qty, setQty] = useState('')
  const [batchDate, setBatchDate] = useState(brusselsToday())
  const [reference, setReference] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi-portal/stock')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load the models')
      setModels(body.models || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/igi-portal/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          qty: Number(qty),
          batch_date: batchDate,
          reference: reference.trim() || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save the batch')

      const model = models.find((m) => m.id === modelId)
      setNotice(`Added ${formatQty(Number(qty))} of ${model?.name || 'that model'}. Your stock has gone up.`)
      setTimeout(() => setNotice(null), 6000)
      setQty(''); setReference('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ready = modelId && Number.isInteger(Number(qty)) && Number(qty) > 0 && batchDate

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>
        Loading...
      </div>
    )
  }

  const chosen = models.find((m) => m.id === modelId)

  return (
    <div style={{ padding: isCompact ? 16 : 28, fontFamily: fonts.body, maxWidth: 620 }}>
      <h1 style={{ fontFamily: fonts.heading, fontSize: isCompact ? 24 : 30, margin: 0, color: colors.text }}>
        Add a batch
      </h1>
      <p style={{ margin: '4px 0 20px', color: colors.textLight, fontSize: 13 }}>
        Certificates you have produced. They are added to your stock.
      </p>

      {error && (
        <div style={{ ...banner, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={dismiss} data-testid="dismiss-error">Dismiss</button>
        </div>
      )}
      {notice && (
        <div style={{ ...banner, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }} data-testid="notice">
          {notice}
        </div>
      )}

      <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={lbl}>Model</div>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            data-testid="model"
            style={{ ...inp, width: '100%' }}
          >
            <option value="">Choose a model…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.serial} · {modelSpec(m)} · {m.name}
              </option>
            ))}
          </select>
          {chosen && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textLight }}>
              You currently hold {formatQty(chosen.pool)}.
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div>
            <div style={lbl}>How many</div>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              data-testid="qty"
              style={{ ...inp, width: '100%', textAlign: 'right' }}
            />
          </div>
          <div>
            <div style={lbl}>Date made</div>
            <input
              type="date"
              value={batchDate}
              onChange={(e) => setBatchDate(e.target.value)}
              data-testid="batch-date"
              style={{ ...inp, width: '100%' }}
            />
          </div>
        </div>

        <div>
          <div style={lbl}>Your reference <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. ATW/26/SC/02896"
            data-testid="reference"
            style={{ ...inp, width: '100%' }}
          />
        </div>

        <button
          onClick={save}
          disabled={!ready || saving}
          data-testid="save-batch"
          style={{ ...btn.primary, opacity: !ready || saving ? 0.45 : 1, alignSelf: 'flex-start' }}
        >
          {saving ? 'Saving…' : 'Add to my stock'}
        </button>
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>
        Batches are never edited or removed, so it stays clear what arrived when. If you get one
        wrong, add another that corrects it.
      </p>
    </div>
  )
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
