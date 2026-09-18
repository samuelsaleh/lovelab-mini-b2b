'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty } from '@/lib/igi/derive'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { useIgiPortal } from './certificates/IgiPortalContext'
import { PageHead, Card, Loading, Toast, Btn, TableWrap, Empty } from './certificates/ui'

/**
 * What IGI hold, beside the level LoveLab want them to hold.
 *
 * "LoveLab want at least" is set by LoveLab and read here — the minimum IGI
 * must keep for them, one number per model. Below it the row says Produce
 * more, and the same models appear on the To do. IGI used to keep a level of
 * their own on this screen ("Warn me below"); nobody ever set it, and two
 * levels on one stock was one too many (Sam, 16 Sept 2026).
 *
 * "Asked right now" is what LoveLab are requesting in open movements — IGI's
 * order book. Together with the level it is all of LoveLab's side this page
 * shows: nothing about the shelf, nothing about how fast anything sells.
 *
 * Below the level the whole row is tinted, sorted to the top, and the
 * shortfall sits beside LoveLab's figure — the column anyone scanning "am I
 * under what they want?" actually looks at (Sam, 18 Sept 2026: the chip was
 * five columns to the left and he did not see it). The figure IGI hold is
 * never shown negative: issued past zero is a recording error, shown as 0
 * with a note, while the shortfall still counts the real gap. Such a row
 * cannot be "corrected" (a count from below zero is meaningless and the
 * table refuses it): the missing batch is recorded, or LoveLab fix the
 * movement.
 *
 * "You hold" can be corrected (Sam, 18 Sept 2026). IGI's figure is
 * arithmetic and nothing on their side feeds it, so when it drifts from the
 * shelf they type what they actually hold. The correction is kept as a count
 * — what it was, what they said, the difference — never an overwrite.
 */
export default function IgiStockClient() {
  const { base } = useIgiPortal()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)   // { id, value }
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function correct(model) {
    const counted = Number(editing?.value)
    if (!Number.isInteger(counted) || counted < 0) return
    if (counted === model.pool) { setEditing(null); return }
    setSaving(true)
    try {
      const res = await fetch(`${base}/counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: model.id, counted }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not save the count')
      setEditing(null)
      if (!body.unchanged) {
        setNotice(`Corrected: ${model.name} now ${formatQty(counted)} (was ${formatQty(model.pool)}). LoveLab see the new figure.`)
        setTimeout(() => setNotice(null), 6000)
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${base}/stock`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not load your stock')
      setModels(body.models || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? models.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
      : models
    // Below the level first, each group in its own order.
    return [...list.filter(belowLevel), ...list.filter((m) => !belowLevel(m))]
  }, [models, query])

  const low = models.filter(belowLevel)

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="My stock"
        sub={low.length > 0
          ? <>{models.length} models. <strong style={{ color: 'var(--signal)' }} data-testid="low-count">{low.length} below the level LoveLab want</strong> — produce more.</>
          : `${models.length} models. Nothing below the level LoveLab want.`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or serial"
          data-testid="search"
          style={{ width: 220 }}
        />
      </PageHead>

      {error && <Toast bad onDismiss={() => setError(null)}>{error}</Toast>}
      {notice && <Toast testId="notice">{notice}</Toast>}

      <Card flush>
        <TableWrap>
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Check</th>
                <th>Serial</th>
                <th className="num">You hold</th>
                <th className="num" title="Set by LoveLab. Below it, produce more.">LoveLab want at least</th>
                <th className="num">Asked right now</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const short = belowLevel(m) ? m.level - m.pool : 0
                const overIssued = m.pool != null && m.pool < 0 ? -m.pool : 0
                return (
                  <tr key={m.id} data-testid="stock-row" className={short > 0 ? 'low' : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {short > 0 && <div style={{ marginTop: 3 }}><Chip tone="now">Produce more</Chip></div>}
                    </td>
                    <td><Spec model={m} compact /></td>
                    <td><Serial model={m} compact /></td>
                    <td className="num" data-testid="you-hold">
                      {editing?.id === m.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            value={editing.value}
                            onChange={(e) => setEditing({ id: m.id, value: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') correct(m); if (e.key === 'Escape') setEditing(null) }}
                            data-testid="counted"
                            autoFocus
                          />
                          <Btn kind="primary" onClick={() => correct(m)} disabled={saving} testId="counted-save">
                            {saving ? 'Saving…' : 'Save'}
                          </Btn>
                          <Btn onClick={() => setEditing(null)} testId="counted-cancel">Cancel</Btn>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <span style={short > 0 ? { color: 'var(--signal)', fontWeight: 600 } : undefined}>{formatQty(Math.max(0, m.pool ?? 0))}</span>
                          {overIssued > 0 ? (
                            <span className="spec" data-testid="over-issued" style={{ textAlign: 'left', maxWidth: 220 }}>
                              {formatQty(overIssued)} more issued than you recorded making — add the batch under Add a batch, or tell LoveLab
                            </span>
                          ) : (
                            <Btn onClick={() => setEditing({ id: m.id, value: String(m.pool ?? 0) })} testId="correct">Correct</Btn>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="num" data-testid="level">
                      {m.level == null ? <span className="spec">no level</span> : formatQty(m.level)}
                      {short > 0 && (
                        <div style={{ color: 'var(--signal)', fontWeight: 600, fontSize: '.8rem' }} data-testid="short-by">
                          short by {formatQty(short)}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {m.asked_now
                        ? <strong>{formatQty(m.asked_now)}</strong>
                        : <span className="spec">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        {shown.length === 0 && <Empty>No model matches that search.</Empty>}
      </Card>

      <p style={{ fontSize: '.83rem', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        Correct a figure when what you hold is not what the screen says. The correction is kept —
        what it was, what you counted, when — and nothing is overwritten. LoveLab see the new figure
        at once.
      </p>
    </>
  )
}

/** Below the level LoveLab want IGI to hold. No level means no rule. */
function belowLevel(m) {
  return m.level != null && m.pool != null && m.pool < m.level
}
