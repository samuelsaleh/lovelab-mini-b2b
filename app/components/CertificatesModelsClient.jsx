'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty, modelSpec } from '@/lib/igi/derive'
import SerialSpec, { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { PageHead, Card, Loading, Toast, Btn, TableWrap } from './certificates/ui'

/**
 * The register of models and serials.
 *
 * Three states, and the difference matters:
 *   in use          — has a serial and a quantity, can be asked for
 *   reserved        — IGI numbered it, nothing was ever ordered. Kept so the
 *                     numbers are not lost, hidden from every other screen
 *   awaiting serial — asked for, IGI have not numbered it. Cannot be made
 *
 * Creating models and assigning serials happens with IGI directly, not here.
 */
export default function CertificatesModelsClient() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [showReserved, setShowReserved] = useState(false)
  const [query, setQuery] = useState('')

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
      setNotice('Renamed. Nothing in the history moved — everything hangs on the serial.')
      setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const inUse = useMemo(() => models.filter((m) => m.state === 'in_use'), [models])
  const reserved = useMemo(() => models.filter((m) => m.state === 'reserved'), [models])
  const awaiting = useMemo(() => models.filter((m) => m.state === 'awaiting_serial'), [models])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inUse
    return inUse.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [inUse, query])

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="Models & serials"
        sub={`${inUse.length} in use, ${reserved.length} reserved serials, ${awaiting.length} waiting for a serial`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ width: 240 }}
        />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      <Card
        title="In use"
        sub="New models and serials are agreed with IGI directly, not created here."
        flush
      >
        <TableWrap>
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Serial</th>
                <th>Check</th>
                <th>Name — ours, and IGI follow it</th>
                <th className="num">Ordered</th>
                <th className="num">At IGI</th>
                <th className="num">On our shelf</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} data-testid="model-row">
                  <td><Serial model={m}None /></td>
                    <td><Spec model={m}None /></td>
                  <td>
                    <NameInput
                      value={m.name}
                      disabled={savingId === m.id}
                      onCommit={(v) => v !== m.name && rename(m.id, v)}
                    />
                    {m.igi_name && m.igi_name !== m.name && (
                      <div className="spec" style={{ marginTop: 3 }}>
                        IGI&rsquo;s file called it {m.igi_name}
                      </div>
                    )}
                  </td>
                  <td className="num">{formatQty(m.qty_ordered)}</td>
                  <td className="num">{formatQty(m.pool)}</td>
                  <td className="num">
                    {m.shelf == null ? <span className="spec">not mapped</span> : formatQty(m.shelf)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {awaiting.length > 0 && (
        <Card
          title={`Waiting for a serial (${awaiting.length})`}
          sub="Asked for, but IGI have not numbered them yet. They cannot be requested until a serial and a first batch exist."
          flush
          testId="awaiting-serial"
        >
          {awaiting.map((m) => (
            <div className="crow" key={m.id}>
              <div className="k">
                {m.name}
                <small>{modelSpec(m)}</small>
              </div>
              <Chip tone="watch">No serial yet</Chip>
            </div>
          ))}
        </Card>
      )}

      <Card
        title="Reserved serials"
        head={
          <Btn kind={showReserved ? 'on' : undefined} onClick={() => setShowReserved((v) => !v)} testId="toggle-reserved">
            {showReserved ? 'Hide' : 'Show'} reserved serials ({reserved.length})
          </Btn>
        }
        flush
      >
        <div className="card-body" style={{ color: 'var(--ink-soft)', fontSize: '.87rem' }}>
          IGI assigned these numbers but nothing was ever ordered against them. They are kept on
          record so the numbers are not lost, and hidden from every operational screen so they
          cannot be requested by accident.
        </div>
        {showReserved && reserved.map((m) => (
          <div className="crow" key={m.id} data-testid="reserved-row">
            <div className="k"><SerialSpec model={m} compact /></div>
            <Chip tone="flat">Reserved</Chip>
          </div>
        ))}
      </Card>
    </>
  )
}

/** Saves on blur rather than on every keystroke. */
function NameInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  return (
    <input
      type="text"
      value={draft}
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
