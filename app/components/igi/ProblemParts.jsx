'use client'

import { useState } from 'react'
import { formatQty } from '@/lib/igi/derive'
import { Serial, Spec } from './SerialSpec'

/**
 * The pieces both sides use when IGI report a problem with a request
 * (lib/igi/problems.js): the table of what IGI suggest beside what was asked,
 * and the picker for a card that is not on the request yet.
 */

/** IGI's suggestions, line by line: model, what was asked, what IGI suggest. */
export function ChangesTable({ changes, askedLabel = 'Asked', suggestLabel = 'IGI suggest' }) {
  if (!changes?.length) {
    return <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No new quantities suggested.</p>
  }
  return (
    <table data-testid="problem-changes">
      <thead>
        <tr>
          <th>Model</th>
          <th>Serial</th>
          <th>Spec</th>
          <th className="num">{askedLabel}</th>
          <th className="num">{suggestLabel}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.model_id} data-testid="problem-change">
            <td style={{ fontWeight: 600 }}>{c.name}</td>
            <td><Serial model={c} compact /></td>
            <td><Spec model={c} compact /></td>
            <td className="num">{c.from == null ? <i style={{ color: 'var(--ink-faint)' }}>not asked</i> : formatQty(c.from)}</td>
            <td className="num"><b>{c.to === 0 ? 'remove' : formatQty(c.to)}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** "LGAJ6575 · Riviera Eight · 8 st · 0,40 ct · Round · D/E" */
export function catalogueLabel(m) {
  const carat = m.carat != null ? `${String(Number(m.carat).toFixed(2)).replace('.', ',')} ct` : null
  return [m.serial, m.name, m.stones ? `${m.stones} st` : null, carat, m.shape, m.spec].filter(Boolean).join(' · ')
}

/**
 * Choose a model that is not on the request yet, and how many. `exclude` are
 * the model ids already on it; `onAdd(modelId, qty)` is called on Add.
 */
export function AddCard({ catalogue, exclude, onAdd, testId = 'add-card' }) {
  const [modelId, setModelId] = useState('')
  const [qty, setQty] = useState('')
  const options = (catalogue || []).filter((m) => !exclude.has(m.id))
  const n = Number(qty)
  const ready = modelId && Number.isInteger(n) && n > 0

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-testid={testId}>
      <select
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
        data-testid={`${testId}-model`}
        style={{ minWidth: 280, maxWidth: 520 }}
      >
        <option value="">Add a card that is not on the request…</option>
        {options.map((m) => <option key={m.id} value={m.id}>{catalogueLabel(m)}</option>)}
      </select>
      <input
        type="number"
        min="1"
        placeholder="How many"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        data-testid={`${testId}-qty`}
        style={{ width: 110 }}
      />
      <button
        type="button"
        className="btn"
        disabled={!ready}
        onClick={() => { onAdd(modelId, n); setModelId(''); setQty('') }}
        data-testid={`${testId}-confirm`}
      >
        Add
      </button>
    </div>
  )
}
