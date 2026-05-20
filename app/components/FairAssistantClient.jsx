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
  const fileInputRef = useRef(null)

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
        const form = new FormData()
        form.append('batchId', activeBatchId)
        form.append('file', file)
        const res = await fetch('/api/fair-assistant/upload', { method: 'POST', body: form })
        const data = await res.json()
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>Fair Assistant</h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.lovelabMuted }}>Upload cards, review leads, send branded outreach emails.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={activeBatchId || ''}
              onChange={(e) => setActiveBatchId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, minWidth: 220 }}
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
              style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body }}
            />
            <button
              onClick={handleCreateBatch}
              disabled={creating || !newBatchName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body }}
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, border: `1px solid ${tab === t.id ? colors.inkPlum : colors.border}`,
                    background: tab === t.id ? colors.inkPlum : '#fff', color: tab === t.id ? '#fff' : colors.text,
                    fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
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
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
                <p style={{ marginTop: 0, color: colors.textLight }}>Select photos from your phone or computer. Each image is uploaded to Google Drive and processed by your existing automation.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  style={{ display: 'block', marginBottom: 12 }}
                />
                {uploading && <p style={{ color: colors.inkPlum }}>Uploading...</p>}
                <p style={{ fontSize: 12, color: colors.lovelabMuted }}>{images.length} images in this batch</p>
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
