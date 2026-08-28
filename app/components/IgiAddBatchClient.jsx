'use client'

import { useState, useEffect } from 'react'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import { brusselsToday } from '@/lib/igi/dates'
import { PageHead, Card, Loading, Toast, Btn } from './certificates/ui'

/**
 * Recording a production run. Model, date, reference, quantity, save.
 *
 * That is the whole page on purpose. IGI's stock is the sum of these batches
 * rather than a number somebody edits, so nothing here overwrites anything —
 * which is also why there is no way to change or remove one afterwards. A
 * mistake is corrected by adding a correcting batch, and the trail survives.
 */
export default function IgiAddBatchClient() {
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

  if (loading) return <Loading />

  const chosen = models.find((m) => m.id === modelId)

  return (
    <div style={{ maxWidth: 620 }}>
      <PageHead title="Add a batch" sub="Certificates you have produced. They are added to your stock." />

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <div className="spec" style={{ marginBottom: 4 }}>Model</div>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              data-testid="model"
              style={{ width: '100%', maxWidth: 'none' }}
            >
              <option value="">Choose a model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.serial} · {modelSpec(m)} · {m.name}
                </option>
              ))}
            </select>
            {chosen && (
              <p style={{ margin: '6px 0 0', fontSize: '.83rem', color: 'var(--ink-soft)' }}>
                You currently hold {formatQty(chosen.pool)}.
              </p>
            )}
          </label>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label>
              <div className="spec" style={{ marginBottom: 4 }}>How many</div>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                data-testid="qty"
                style={{ width: 120 }}
              />
            </label>
            <label>
              <div className="spec" style={{ marginBottom: 4 }}>Date made</div>
              <input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                data-testid="batch-date"
              />
            </label>
          </div>

          <label>
            <div className="spec" style={{ marginBottom: 4 }}>Your reference (optional)</div>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. ATW/26/SC/02896"
              data-testid="reference"
              style={{ width: '100%' }}
            />
          </label>

          <div>
            <Btn kind="primary" onClick={save} disabled={!ready || saving} testId="save-batch">
              {saving ? 'Saving…' : 'Add to my stock'}
            </Btn>
          </div>
        </div>
      </Card>

      <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        Batches are never edited or removed, so it stays clear what arrived when. If you get one
        wrong, add another that corrects it.
      </p>
    </div>
  )
}
