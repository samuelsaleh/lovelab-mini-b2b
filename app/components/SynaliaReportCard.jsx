'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { getCurrentQuarter, listSynaliaQuarterOptions } from '@/lib/synaliaQuarter'

/**
 * SYNALIA quarterly export — separate from Commission Report.
 * Excel → Google Drive + email Dionne when admin clicks Send.
 */
export default function SynaliaReportCard({ agentId, agentName }) {
  const now = useMemo(() => new Date(), [])
  const quarters = useMemo(() => listSynaliaQuarterOptions(now, 8), [now])
  const defaultQ = useMemo(() => getCurrentQuarter(now), [now])

  const [year, setYear] = useState(defaultQ.year)
  const [quarter, setQuarter] = useState(defaultQ.quarter)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [driveLink, setDriveLink] = useState(null)

  const loadPreview = useCallback(async () => {
    if (!agentId) return
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/synalia-report/preview?agent_id=${encodeURIComponent(agentId)}&year=${year}&quarter=${quarter}`,
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Preview failed')
      setPreview(json)
    } catch (err) {
      setPreview(null)
      setError(err.message || 'Preview failed')
    } finally {
      setLoadingPreview(false)
    }
  }, [agentId, year, quarter])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const handleSend = async () => {
    if (!agentId || sending) return
    setSending(true)
    setMessage(null)
    setError(null)
    setDriveLink(null)
    try {
      const res = await fetch('/api/synalia-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, year, quarter }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Send failed')

      const parts = []
      if (json.drive?.ok && json.drive.webViewLink) parts.push('Enregistré sur Drive')
      else if (json.drive?.error) parts.push(`Drive : ${json.drive.error}`)
      if (json.email?.sent) parts.push(`Email envoyé à ${json.email.recipient}`)
      else if (json.email?.error) parts.push(`Email : ${json.email.error}`)

      setMessage(parts.length ? parts.join(' · ') : 'Rapport généré.')
      setDriveLink(json.drive?.webViewLink || null)
    } catch (err) {
      setError(err.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const exportUrl = `/api/synalia-report/export?agent_id=${encodeURIComponent(agentId)}&year=${year}&quarter=${quarter}`
  const downloadName = `${agentName || 'Agent'} - SYNALIA T${quarter} ${year}.xlsx`

  const fmtEuro = (n) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${colors.lineGray}`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${colors.lineGray}`,
        fontSize: 13,
        fontWeight: 700,
        color: colors.inkPlum,
      }}>
        Export SYNALIA
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, marginBottom: 6, textTransform: 'uppercase' }}>
            Trimestre
          </div>
          <select
            value={`${year}-${quarter}`}
            onChange={(e) => {
              const [y, q] = e.target.value.split('-').map(Number)
              setYear(y)
              setQuarter(q)
              setDriveLink(null)
              setMessage(null)
            }}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${colors.lineGray}`,
              fontSize: 13,
              fontFamily: fonts.body,
            }}
          >
            {quarters.map((q) => (
              <option key={`${q.year}-${q.quarter}`} value={`${q.year}-${q.quarter}`}>
                {q.isCurrent ? `${q.labelLong} (en cours)` : q.labelLong}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, color: colors.charcoal }}>
          {loadingPreview ? (
            <span style={{ color: colors.lovelabMuted }}>…</span>
          ) : preview ? (
            <>
              {preview.orderCount} commande{preview.orderCount !== 1 ? 's' : ''}
              {' · '}
              {preview.clientCount} client{preview.clientCount !== 1 ? 's' : ''}
              {' · '}
              {fmtEuro(preview.grandTotal)}
            </>
          ) : (
            <span style={{ color: colors.lovelabMuted }}>—</span>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: '8px 10px', borderRadius: 8 }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', padding: '8px 10px', borderRadius: 8 }}>
            {message}
            {driveLink && (
              <>
                {' · '}
                <a href={driveLink} target="_blank" rel="noopener noreferrer" style={{ color: colors.inkPlum, fontWeight: 700 }}>
                  Drive
                </a>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !agentId}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: sending ? '#ccc' : colors.inkPlum,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: sending ? 'default' : 'pointer',
              fontFamily: fonts.body,
            }}
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          <a
            href={exportUrl}
            download={downloadName}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.lineGray}`,
              background: '#fff',
              color: colors.inkPlum,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              fontFamily: fonts.body,
            }}
          >
            Télécharger
          </a>
        </div>
      </div>
    </div>
  )
}
