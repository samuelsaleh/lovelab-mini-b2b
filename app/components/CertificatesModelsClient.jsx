'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { isUnnamed } from '@/lib/igi/derive'
import { canDeleteModel } from '@/lib/igi/models'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Toast, Btn, TableWrap } from './certificates/ui'

/**
 * The register of models — and the two levels per model that drive Stock.
 *
 * One flat list. A model waiting for IGI's serial is a chip on its row, not a
 * section of its own. Reserved serials (numbered by IGI, never ordered) are
 * not shown at all: nothing can be done with them here.
 *
 * Each company enters its own half (Sam, 10 Sept 2026): LoveLab add the model
 * here — name, stones, carat, shape — and IGI give it its serial from their
 * To do. The serial is set once and never changed.
 *
 * Sam, 16 Sept 2026: "too much information". The levels moved here from Stock,
 * the reserved section and the matching table went, and the New model form
 * sits behind a button until it is needed.
 */
const SHAPES = ['Round', 'Oval', 'Pear', 'Marquise', 'Cushion', 'Long Cushion', 'Emerald', 'Heart', 'Princess', 'Radiant', 'Asscher', 'Baguette']
const EMPTY_FORM = { name: '', stones: '1', carat: '', shape: 'Round' }

export default function CertificatesModelsClient() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/igi/overview')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load the models')
      setModels(body.models || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function say(text, ms = 5000) {
    setNotice(text)
    setTimeout(() => setNotice(null), ms)
  }

  async function addModel(e) {
    e?.preventDefault?.()
    setAdding(true)
    try {
      const res = await fetch('/api/igi/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, stones: form.stones, carat: Number(form.carat), shape: form.shape }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to add the model')
      setModels((prev) => [...prev, { ...body.model, pool: null, shelf: null }])
      setForm(EMPTY_FORM)
      setFormOpen(false)
      say(`${body.model.name} added. It is on IGI's To do; once they give it a serial it appears on Stock.`, 7000)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function rename(modelId, name) {
    setSavingId(modelId)
    try {
      const res = await fetch('/api/igi/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the name')
      setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, name: body.model.name } : m)))
      say('Renamed. Nothing in the history moved — everything hangs on the serial.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  // A model still waiting for its serial can be taken back; a numbered one
  // never can (lib/igi/models.js). Two clicks, no browser dialog.
  async function remove(model) {
    setSavingId(model.id)
    try {
      const res = await fetch('/api/igi/models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: model.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to remove the model')
      setModels((prev) => prev.filter((m) => m.id !== model.id))
      say(`${model.name} removed. It was never numbered, so nothing else changes.`)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
      setConfirmingId(null)
    }
  }

  // ── Levels + opening shelf (base for In/Out) ───────────────────────────
  async function saveLevel(modelId, shelfMin, orderMin, shelfOpening) {
    setSavingId(modelId)
    try {
      const payload = { model_ids: [modelId] }
      if (shelfMin !== undefined) payload.shelf_min = shelfMin
      if (orderMin !== undefined) payload.order_min = orderMin
      if (shelfOpening !== undefined) payload.shelf_opening = shelfOpening
      const res = await fetch('/api/igi/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to save the level')
      setModels((prev) => prev.map((m) => (
        m.id === modelId
          ? {
            ...m,
            ...(shelfMin !== undefined ? { shelf_min: shelfMin } : {}),
            ...(orderMin !== undefined ? { order_min: orderMin } : {}),
            ...(shelfOpening !== undefined ? { shelf_opening: shelfOpening } : {}),
          }
          : m
      )))
      say(shelfOpening !== undefined
        ? 'Opening shelf saved. On our shelf = opening + Certificate In − Certificate Out.'
        : orderMin !== undefined
          ? 'Saved. IGI see this level on their side; below it, Stock says "Order at IGI" and their To do says "Produce more".'
          : 'Shelf level saved. Stock says "Collect" when we fall below it.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const inUse = useMemo(() => models.filter((m) => m.state === 'in_use'), [models])
  const awaiting = useMemo(() => models.filter((m) => m.state === 'awaiting_serial'), [models])
  const unnamed = inUse.filter(isUnnamed).length

  const shown = useMemo(() => {
    const all = [...inUse, ...awaiting]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [inUse, awaiting, query])

  if (loading) return <Loading />

  const facts = [
    `${inUse.length} in use`,
    awaiting.length ? `${awaiting.length} waiting for a serial` : null,
    unnamed ? `${unnamed} without a name` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <PageHead
        title="Models"
        sub="Every certificate model, and the two levels that drive the Stock page."
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a model"
          data-testid="search"
          style={{ width: 230 }}
        />
        <Btn kind={formOpen ? 'on' : 'primary'} onClick={() => setFormOpen((v) => !v)} testId="new-model-toggle">
          New model
        </Btn>
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      {formOpen && (
        <Card
          title="New model"
          sub="Say what the piece is. IGI give it its serial on their side."
          testId="new-model"
        >
          <form onSubmit={addModel} data-testid="new-model-form" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 4, flex: '2 1 240px' }}>
              <span className="spec">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Full Moonlight"
                data-testid="new-model-name"
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: '0 1 90px' }}>
              <span className="spec">Stones</span>
              <input
                type="text"
                value={form.stones}
                onChange={(e) => setForm((f) => ({ ...f, stones: e.target.value }))}
                placeholder="1 or 6+1"
                data-testid="new-model-stones"
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: '0 1 100px' }}>
              <span className="spec">Carat</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.carat}
                onChange={(e) => setForm((f) => ({ ...f, carat: e.target.value }))}
                placeholder="0.50"
                data-testid="new-model-carat"
                required
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: '0 1 150px' }}>
              <span className="spec">Shape</span>
              <select value={form.shape} onChange={(e) => setForm((f) => ({ ...f, shape: e.target.value }))} data-testid="new-model-shape">
                {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <Btn kind="primary" type="submit" disabled={adding} testId="new-model-submit">
              {adding ? 'Adding…' : 'Add model'}
            </Btn>
          </form>
        </Card>
      )}

      <Card title="All models" sub={facts} flush>
        <TableWrap>
          <table style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Model</th>
                <th>Stones</th>
                <th>Serial</th>
                <th className="num" title="Starting stock before Certificate In/Out. On our shelf = opening + In − Out">Opening shelf</th>
                <th className="num" title="Below this on our shelf, Stock says Collect">Shelf level</th>
                <th className="num" title="Below this at IGI, Stock says Order at IGI and IGI's To do says Produce more. Empty means no rule.">IGI must hold</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const waiting = m.state === 'awaiting_serial'
                return (
                  <tr key={m.id} data-testid={waiting ? 'awaiting-row' : 'model-row'}>
                    <td>
                      <NameInput
                        value={isUnnamed(m) ? '' : m.name}
                        placeholder={isUnnamed(m) ? 'Unnamed — type a name' : undefined}
                        disabled={savingId === m.id}
                        onCommit={(v) => v !== m.name && rename(m.id, v)}
                      />
                    </td>
                    <td><Spec model={m} /></td>
                    <td>
                      {waiting
                        ? (
                          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Chip tone="watch">Waiting for IGI’s serial</Chip>
                            {canDeleteModel(m) && (confirmingId === m.id
                              ? (
                                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '.8rem', color: 'var(--ink-soft)' }}>
                                  Remove this model?
                                  <Btn kind="danger" onClick={() => remove(m)} disabled={savingId === m.id} testId="delete-model-confirm">
                                    {savingId === m.id ? 'Removing…' : 'Yes, remove'}
                                  </Btn>
                                  <Btn onClick={() => setConfirmingId(null)} testId="delete-model-keep">Keep</Btn>
                                </span>
                              )
                              : <Btn onClick={() => setConfirmingId(m.id)} testId="delete-model">Remove</Btn>)}
                          </span>
                        )
                        : <Serial model={m} />}
                    </td>
                    <td className="num">
                      <LevelInput
                        value={m.shelf_opening}
                        placeholder="0"
                        allowEmpty
                        disabled={savingId === m.id || waiting}
                        testId="shelf-opening"
                        onCommit={(v) => v !== (m.shelf_opening ?? null) && saveLevel(m.id, undefined, undefined, v)}
                      />
                    </td>
                    <td className="num">
                      <LevelInput
                        value={m.shelf_min}
                        placeholder="25"
                        disabled={savingId === m.id}
                        testId="shelf-min"
                        onCommit={(v) => v !== (m.shelf_min ?? null) && saveLevel(m.id, v)}
                      />
                    </td>
                    <td className="num">
                      <LevelInput
                        value={m.order_min}
                        placeholder="none"
                        allowEmpty
                        disabled={savingId === m.id}
                        testId="order-min"
                        onCommit={(v) => v !== (m.order_min ?? null) && saveLevel(m.id, undefined, v)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        <div className="card-foot">
          <span>
            A level saves when you leave the box. <b>Opening shelf</b> is the starting stock;
            On our shelf = opening + Certificate In − Certificate Out. IGI see "IGI must hold" on their side.
            A model waiting for a serial appears on Stock as soon as IGI give one, and can be removed until then; a numbered one never can.
          </span>
          <Link href="/certificates/matching" className="right" data-testid="go-matching">
            Match stock descriptions to a model →
          </Link>
        </div>
      </Card>
    </>
  )
}

/** Saves on blur rather than on every keystroke. */
function NameInput({ value, placeholder, disabled, onCommit }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next) onCommit(next)
        else setDraft(value)
      }}
      data-testid="model-name"
      style={{ width: '100%', maxWidth: 380 }}
    />
  )
}

/**
 * A number that saves when it loses focus. `allowEmpty` means "no level" is
 * a valid answer — our level on IGI's stock is an opinion we may not hold.
 */
function LevelInput({ value, placeholder, disabled, onCommit, testId, allowEmpty = false }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])

  return (
    <input
      type="number"
      min="0"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === '') {
          if (allowEmpty) onCommit(null)
          else setDraft(value == null ? '' : String(value))
          return
        }
        const n = Number(draft)
        if (Number.isInteger(n) && n >= 0) onCommit(n)
        else setDraft(value == null ? '' : String(value))
      }}
      data-testid={testId}
    />
  )
}
