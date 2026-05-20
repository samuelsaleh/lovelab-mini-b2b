'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { createClient } from '@/lib/supabase/client'
import { FAIR_OUTREACH_TEMPLATES } from '@/lib/fair-assistant/templates'
import FairOutreachChatPanel from '@/app/components/FairOutreachChatPanel'

const TABS = [
  { id: 'upload', label: 'Upload' },
  { id: 'leads', label: 'Leads' },
  { id: 'outreach', label: 'Outreach' },
]

// Vercel's serverless body limit is 4.5 MB. iPhone photos are 5-10 MB
// and HEIC images can be even larger. Run multiple compression passes
// of increasing aggression until we land under 3 MB (safety margin)
// or run out of options. 1280 px is still well above what GPT-4 OCR
// needs to read a business card.
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed (unsupported format?)')) }
    img.src = url
  })
}

async function compressPass(file, bitmap, maxDim, quality) {
  let { width, height } = bitmap
  if (!width || !height) throw new Error('Image has zero dimensions')
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Canvas toBlob returned null')); return }
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
        resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }))
      },
      'image/jpeg',
      quality
    )
  })
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file
  // Even small files can be HEIC and reject from the server — always compress
  // unless the file is already a small JPEG/PNG.
  if (file.size <= 800 * 1024 && /jpeg|jpg|png/i.test(file.type)) return file

  const bitmap = await loadBitmap(file)
  const passes = [
    { maxDim: 1600, quality: 0.85 },
    { maxDim: 1280, quality: 0.75 },
    { maxDim: 1024, quality: 0.65 },
    { maxDim: 800,  quality: 0.55 },
    { maxDim: 640,  quality: 0.5  },
  ]
  let last = null
  for (const opts of passes) {
    last = await compressPass(file, bitmap, opts.maxDim, opts.quality)
    if (last.size <= 3 * 1024 * 1024) break
  }
  if (bitmap.close) bitmap.close()
  return last
}

export default function FairAssistantClient() {
  const [batches, setBatches] = useState([])
  const [activeBatchId, setActiveBatchId] = useState(null)
  const [batch, setBatch] = useState(null)
  const [leads, setLeads] = useState([])
  const [images, setImages] = useState([])
  const [tab, setTab] = useState('upload')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newBatchName, setNewBatchName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [countryFilter, setCountryFilter] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busyAction, setBusyAction] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  const loadBatches = useCallback(async () => {
    const res = await fetch('/api/fair-assistant/batches')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load batches')
    setBatches(data.batches || [])
    return data.batches || []
  }, [])

  const loadBatchDetails = useCallback(async (batchId) => {
    if (!batchId) return
    const res = await fetch(`/api/fair-assistant/batches/${batchId}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load batch')
    setBatch(data.batch)
    setLeads(data.leads || [])
    setImages(data.images || [])
  }, [])

  useEffect(() => {
    loadBatches()
      .then((list) => {
        if (list.length && !activeBatchId) setActiveBatchId(list[0].id)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [loadBatches, activeBatchId])

  useEffect(() => {
    if (!activeBatchId) return
    loadBatchDetails(activeBatchId).catch((err) => setError(err.message))
  }, [activeBatchId, loadBatchDetails])

  useEffect(() => {
    if (!activeBatchId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`fair-batch-${activeBatchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fair_leads', filter: `batch_id=eq.${activeBatchId}` }, () => {
        loadBatchDetails(activeBatchId)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fair_batches', filter: `id=eq.${activeBatchId}` }, () => {
        loadBatchDetails(activeBatchId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeBatchId, loadBatchDetails])

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (countryFilter && (lead.country || '') !== countryFilter) return false
      if (languageFilter && !(lead.language || '').includes(languageFilter)) return false
      return true
    })
  }, [leads, countryFilter, languageFilter])

  const countries = useMemo(() => [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(), [leads])
  const languages = useMemo(() => {
    const set = new Set()
    for (const lead of leads) {
      for (const part of (lead.language || 'en').split('+')) set.add(part)
    }
    return [...set].sort()
  }, [leads])

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBatchName.trim(), fairName: newBatchName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create batch')
      setNewBatchName('')
      await loadBatches()
      setActiveBatchId(data.batch.id)
      setTab('upload')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleUploadFiles = async (fileList) => {
    if (!activeBatchId || !fileList?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of fileList) {
        let toSend = file
        let compressError = null
        try {
          toSend = await compressImage(file)
        } catch (err) {
          compressError = err.message
        }
        const origKB = Math.round(file.size / 1024)
        const sentKB = Math.round(toSend.size / 1024)
        const form = new FormData()
        form.append('batchId', activeBatchId)
        form.append('file', toSend)
        const res = await fetch('/api/fair-assistant/upload', { method: 'POST', body: form })
        let data
        try {
          data = await res.json()
        } catch {
          if (res.status === 413) {
            throw new Error(
              compressError
                ? `Photo too large after compression failed (${compressError}). Original ${origKB} KB. Try saving the photo as JPEG and re-uploading.`
                : `Photo too large: sent ${sentKB} KB (from original ${origKB} KB) — Vercel limit is ~4.5 MB. Compression helped but not enough.`
            )
          }
          throw new Error(`Server error (HTTP ${res.status}) uploading ${file.name}`)
        }
        if (!res.ok) throw new Error(data.error || `Failed to upload ${file.name}`)
      }
      await loadBatchDetails(activeBatchId)
      setTab('leads')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveBatchFields = async (patch) => {
    if (!activeBatchId) return
    const res = await fetch(`/api/fair-assistant/batches/${activeBatchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to save')
    setBatch(data.batch)
  }

  const applyTemplate = async (templateId) => {
    const template = FAIR_OUTREACH_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    await saveBatchFields({
      template_id: template.id,
      headline: template.headline,
      paragraph1: template.paragraph1,
      paragraph2: template.paragraph2,
      signoff: template.signoff,
    })
  }

  const runPreview = async () => {
    if (!activeBatchId) return
    setBusyAction('preview')
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreviewHtml(data.preview.bodyHtml)
      setPreviewOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  const runGenerateAll = async () => {
    if (!activeBatchId) return
    setBusyAction('generate')
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generate failed')
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  const runSend = async () => {
    if (!activeBatchId) return
    setBusyAction('send')
    setError(null)
    try {
      const genRes = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Generate failed')

      const res = await fetch('/api/fair-assistant/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading Fair Assistant...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px' : '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Fair Assistant</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.lovelabMuted }}>Upload cards, review leads, send branded outreach emails.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
            <select
              value={activeBatchId || ''}
              onChange={(e) => setActiveBatchId(e.target.value)}
              style={{ padding: '12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, minWidth: isMobile ? 'auto' : 220, fontSize: 15, background: '#fff' }}
            >
              <option value="">Select batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.status})</option>
              ))}
            </select>
            <input
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="New fair name"
              style={{ padding: '12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, fontSize: 15 }}
            />
            <button
              onClick={handleCreateBatch}
              disabled={creating || !newBatchName.trim()}
              style={{ padding: '12px 16px', minHeight: 44, borderRadius: 8, border: 'none', background: newBatchName.trim() ? colors.inkPlum : '#c5b9cf', color: '#fff', fontWeight: 600, cursor: newBatchName.trim() ? 'pointer' : 'not-allowed', fontFamily: fonts.body, fontSize: 15 }}
            >
              + New batch
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
            {error}
            <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {!activeBatchId ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.lovelabMuted }}>Create or select a batch to begin.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4, alignItems: 'center' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '10px 18px', minHeight: 40, borderRadius: 20, border: `1px solid ${tab === t.id ? colors.inkPlum : colors.border}`,
                    background: tab === t.id ? colors.inkPlum : '#fff', color: tab === t.id ? '#fff' : colors.text,
                    fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {t.label}
                </button>
              ))}
              {batch && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: colors.lovelabMuted, alignSelf: 'center' }}>
                  {batch.total_leads || 0} leads · {batch.total_sent || 0} sent · status: {batch.status}
                </span>
              )}
            </div>

            {tab === 'upload' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: isMobile ? 16 : 24 }}>
                <p style={{ marginTop: 0, color: colors.textLight, fontSize: 14 }}>Snap or pick business card photos. Each one is uploaded to Drive and processed automatically.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 16 }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      flex: 1, padding: isMobile ? '20px 16px' : '16px 24px',
                      minHeight: 64, borderRadius: 12, border: 'none',
                      background: uploading ? '#c5b9cf' : colors.inkPlum, color: '#fff',
                      fontWeight: 700, fontSize: 16, cursor: uploading ? 'wait' : 'pointer',
                      fontFamily: fonts.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    {uploading ? 'Uploading…' : 'Take / pick photos'}
                  </button>
                </div>

                {images.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Photos in this batch</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {images.map((img, i) => {
                        const statusColor =
                          img.status === 'processed' ? '#16a34a' :
                          img.status === 'failed' ? '#dc2626' :
                          img.status === 'processing' ? '#ca8a04' : colors.lovelabMuted
                        const statusLabel =
                          img.status === 'processed' ? '✓ done' :
                          img.status === 'failed' ? '✗ failed' :
                          img.status === 'processing' ? '⋯ processing' : img.status
                        return (
                          <div key={img.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, padding: '8px 10px', background: '#fafafa', borderRadius: 6 }}>
                            <span style={{ color: colors.lovelabMuted, minWidth: 24 }}>#{i + 1}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.file_name || 'card.jpg'}</span>
                            <span style={{ color: statusColor, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                    {images.some((i) => i.status === 'failed' && i.error) && (
                      <details style={{ marginTop: 10, fontSize: 12, color: colors.lovelabMuted }}>
                        <summary style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>Show failure details</summary>
                        <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                          {images.filter((i) => i.status === 'failed' && i.error).map((i, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>
                              <strong>{i.file_name || 'card.jpg'}:</strong> {i.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: colors.lovelabMuted, borderTop: `1px solid ${colors.borderLight || colors.border}`, paddingTop: 12 }}>
                  <span><strong style={{ color: colors.inkPlum, fontSize: 16 }}>{images.length}</strong> photo{images.length === 1 ? '' : 's'} in this batch</span>
                  <span>{batch?.total_leads || 0} lead{(batch?.total_leads || 0) === 1 ? '' : 's'} extracted</span>
                </div>
              </div>
            )}

            {tab === 'leads' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}` }}>
                    <option value="">All countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}` }}>
                    <option value="">All languages</option>
                    {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ padding: 8 }}>Name</th>
                        <th style={{ padding: 8 }}>Company</th>
                        <th style={{ padding: 8 }}>Country</th>
                        <th style={{ padding: 8 }}>Language</th>
                        <th style={{ padding: 8 }}>Email</th>
                        <th style={{ padding: 8 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                          <td style={{ padding: 8 }}>{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.company || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.country || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.language_label || lead.language || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.email || '—'}</td>
                          <td style={{ padding: 8 }}>{lead.status}</td>
                        </tr>
                      ))}
                      {!filteredLeads.length && (
                        <tr><td colSpan={6} style={{ padding: 16, color: colors.lovelabMuted }}>No leads yet. Upload card photos to begin.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'outreach' && batch && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {FAIR_OUTREACH_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 16, border: `1px solid ${batch.template_id === t.id ? colors.inkPlum : colors.border}`,
                          background: batch.template_id === t.id ? '#f8f0fa' : '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12,
                        }}
                      >
                        {t.name}
                      </button>
                    ))}
                    <button onClick={() => setChatOpen(true)} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 16, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12 }}>
                      ✨ Chat with Claude
                    </button>
                  </div>
                  {['headline', 'paragraph1', 'paragraph2', 'signoff'].map((field) => (
                    <label key={field} style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                      <span style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: colors.inkPlum, textTransform: 'capitalize' }}>{field}</span>
                      {field === 'signoff' || field.startsWith('paragraph') ? (
                        <textarea
                          value={batch[field] || ''}
                          onChange={(e) => setBatch({ ...batch, [field]: e.target.value })}
                          onBlur={() => saveBatchFields({ [field]: batch[field] })}
                          rows={field === 'signoff' ? 3 : 4}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, resize: 'vertical' }}
                        />
                      ) : (
                        <input
                          value={batch[field] || ''}
                          onChange={(e) => setBatch({ ...batch, [field]: e.target.value })}
                          onBlur={() => saveBatchFields({ [field]: batch[field] })}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body }}
                        />
                      )}
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={runPreview} disabled={busyAction === 'preview'} style={actionBtnStyle}>{busyAction === 'preview' ? 'Loading...' : 'Preview email'}</button>
                    <button onClick={runGenerateAll} disabled={busyAction === 'generate'} style={actionBtnStyle}>{busyAction === 'generate' ? 'Generating...' : 'Generate all drafts'}</button>
                    <button onClick={runSend} disabled={busyAction === 'send'} style={{ ...actionBtnStyle, background: colors.inkPlum, color: '#fff' }}>{busyAction === 'send' ? 'Sending...' : `Send to ${leads.length} leads`}</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {previewOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewOpen(false)}>
          <div style={{ background: '#fff', width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <strong>Email preview</strong>
              <button onClick={() => setPreviewOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <iframe title="Email preview" srcDoc={previewHtml || ''} style={{ width: '100%', minHeight: 600, border: 'none' }} />
          </div>
        </div>
      )}

      <FairOutreachChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        batch={batch}
        leadCount={leads.length}
        onApplyDraft={(draft) => {
          setBatch((prev) => ({ ...prev, ...draft }))
          saveBatchFields(draft)
        }}
      />
    </div>
  )
}

const actionBtnStyle = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 600,
}
