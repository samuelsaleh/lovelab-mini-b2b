'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatQty } from '@/lib/igi/derive'
import { Serial, Spec } from './igi/SerialSpec'
import Chip from './igi/Chip'
import { useIgiPortal } from './certificates/IgiPortalContext'
import { PageHead, Card, Loading, Toast, TableWrap, Empty } from './certificates/ui'

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
 */
export default function IgiStockClient() {
  const { base } = useIgiPortal()
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

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
    if (!q) return models
    return models.filter((m) => `${m.name} ${m.serial} ${m.shape}`.toLowerCase().includes(q))
  }, [models, query])

  const low = models.filter(belowLevel)

  if (loading) return <Loading />

  return (
    <>
      <PageHead
        title="My stock"
        sub={`${models.length} models. ${low.length > 0
          ? `${low.length} below the level LoveLab want — worth producing more.`
          : 'Nothing below the level LoveLab want.'}`}
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
                return (
                  <tr key={m.id} data-testid="stock-row">
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      {short > 0 && (
                        <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Chip tone="now">Produce more</Chip>
                          <span className="spec" data-testid="short-by">short by {formatQty(short)}</span>
                        </div>
                      )}
                    </td>
                    <td><Spec model={m} compact /></td>
                    <td><Serial model={m} compact /></td>
                    <td className="num" style={short > 0 ? { color: 'var(--signal)', fontWeight: 600 } : undefined}>
                      {formatQty(m.pool)}
                    </td>
                    <td className="num" data-testid="level">
                      {m.level == null ? <span className="spec">no level</span> : formatQty(m.level)}
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
    </>
  )
}

/** Below the level LoveLab want IGI to hold. No level means no rule. */
function belowLevel(m) {
  return m.level != null && m.pool != null && m.pool < m.level
}
