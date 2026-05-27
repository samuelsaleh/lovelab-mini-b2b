'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { createClient } from '@/lib/supabase/client'
import { FAIR_OUTREACH_TEMPLATES, FAIR_LEAD_TYPES } from '@/lib/fair-assistant/templates'
import { B2B_RESOURCE_GROUPS } from '@/lib/b2b-files'
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
  const [drafts, setDrafts] = useState([])
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
  const [uploadProgress, setUploadProgress] = useState(null)
  const [editingLead, setEditingLead] = useState(null)
  const [savedTemplates, setSavedTemplates] = useState([])
  const [livePreviewHtml, setLivePreviewHtml] = useState('')
  const [livePreviewLoading, setLivePreviewLoading] = useState(false)
  // Default OFF on phones — the form should own the screen. User can toggle on.
  const [showLivePreview, setShowLivePreview] = useState(false)
  const [imageLibrary, setImageLibrary] = useState({ groups: [], loaded: false, openGroup: null })
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)

  // Ephemeral confirmation messages (image copied, link copied, etc.) live in
  // a floating bottom toast — separate from setError so they don't masquerade
  // as failures and so users can see them no matter how far they're scrolled.
  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2400)
  }, [])

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => {
      const m = mql.matches
      setIsMobile(m)
      // Show the preview by default on desktop; collapse it on phones so
      // the form has the screen. User can still toggle it open.
      setShowLivePreview(!m)
    }
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
    setDrafts(data.drafts || [])
  }, [])

  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/fair-assistant/saved-templates')
      const data = await res.json()
      if (res.ok) setSavedTemplates(data.templates || [])
    } catch {}
  }, [])

  useEffect(() => {
    loadBatches()
      .then((list) => {
        if (list.length && !activeBatchId) setActiveBatchId(list[0].id)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    loadSavedTemplates()
  }, [loadBatches, activeBatchId, loadSavedTemplates])

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

  // Debounced live email preview — refreshes whenever a content/button field
  // changes while the Outreach tab is open. Renders in EN (no Claude
  // translation) so typing feels instant, and skips entirely if there are
  // no leads yet (preview needs a recipient for the greeting).
  useEffect(() => {
    if (tab !== 'outreach' || !activeBatchId || !batch) {
      return
    }
    const t = setTimeout(async () => {
      setLivePreviewLoading(true)
      try {
        const overrides = {
          subject: batch.subject,
          headline: batch.headline,
          paragraph1: batch.paragraph1,
          paragraph2: batch.paragraph2,
          signoff: batch.signoff,
          cta_line: batch.cta_line,
          button1_label: batch.button1_label,
          button1_url: batch.button1_url,
          button2_label: batch.button2_label,
          button2_url: batch.button2_url,
          custom_html: batch.custom_html,
        }
        const res = await fetch('/api/fair-assistant/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // allowPlaceholder=true lets the server render the email shell with
          // a generic recipient when no leads exist yet (otherwise the user
          // sees a confusing "no leads available" error before uploading).
          body: JSON.stringify({ batchId: activeBatchId, overrides, allowPlaceholder: true }),
        })
        const data = await res.json()
        if (res.ok && data?.preview?.bodyHtml) {
          // Only toast on actual content change so we don't fire every keystroke.
          setLivePreviewHtml((prev) => {
            if (prev !== data.preview.bodyHtml) showToast('✓ Preview updated')
            return data.preview.bodyHtml
          })
        }
      } catch {
        /* keep prior preview on error */
      } finally {
        setLivePreviewLoading(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [
    tab,
    activeBatchId,
    // Intentionally omitting leads.length — the live preview only needs to
    // re-render when the batch's editable fields change. Without this,
    // every realtime lead insert (n8n callback) re-runs the preview.
    batch?.subject,
    batch?.headline,
    batch?.paragraph1,
    batch?.paragraph2,
    batch?.signoff,
    batch?.cta_line,
    batch?.button1_label,
    batch?.button1_url,
    batch?.button2_label,
    batch?.button2_url,
    batch?.custom_html,
  ])

  const loadImageLibrary = useCallback(async () => {
    if (imageLibrary.loaded) return
    try {
      const res = await fetch('/api/fair-assistant/image-library')
      const data = await res.json()
      if (res.ok) {
        setImageLibrary({ groups: data.groups || [], loaded: true, openGroup: data.groups?.[0]?.id || null })
      }
    } catch {
      setImageLibrary({ groups: [], loaded: true, openGroup: null })
    }
  }, [imageLibrary.loaded])

  const handleClearAllFields = useCallback(async () => {
    if (!activeBatchId || !batch) return
    if (!window.confirm('Clear all email fields for this batch? Headline, paragraphs, buttons, custom HTML, and attachments will be reset.')) return
    const reset = {
      headline: '', paragraph1: '', paragraph2: '', signoff: '',
      cta_line: '',
      button1_label: '', button1_url: '', button2_label: '', button2_url: '',
      custom_html: '',
      attached_files: [],
    }
    setBatch({ ...batch, ...reset })
    try {
      await saveBatchFields(reset)
    } catch (err) {
      setError(err.message)
    }
  }, [activeBatchId, batch])

  const handleMarkImageDuplicate = useCallback(async (imageId, fileName) => {
    if (!activeBatchId) return
    if (!window.confirm(`Mark "${fileName || 'this photo'}" as a Salesforce duplicate?\n\nUse this when n8n found an existing Salesforce lead for this card (so it didn't create a new one and never called back). The photo will show as "✓ done (duplicate)" instead of stuck.`)) return
    try {
      const res = await fetch(`/api/fair-assistant/images/${imageId}/mark-duplicate`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to mark as duplicate')
      await loadBatchDetails(activeBatchId)
      showToast('✓ Marked as duplicate (already in Salesforce)')
    } catch (err) {
      setError(err.message)
    }
  }, [activeBatchId, loadBatchDetails, showToast])

  const handleDeleteImage = useCallback(async (imageId, fileName) => {
    if (!activeBatchId) return
    if (!window.confirm(`Delete "${fileName || 'this photo'}" from the batch?\n\nUse this when a photo is stuck on "processing" because the n8n callback never arrived. The photo will be removed from the batch and (best-effort) from Drive. If n8n later sends a callback for it, the lead will still be created without an image link.`)) return
    try {
      const res = await fetch(`/api/fair-assistant/images/${imageId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete image')
      await loadBatchDetails(activeBatchId)
      showToast('✓ Photo removed from batch')
    } catch (err) {
      setError(err.message)
    }
  }, [activeBatchId, loadBatchDetails, showToast])

  const toggleAttachment = useCallback((path) => {
    if (!batch) return
    const current = Array.isArray(batch.attached_files) ? batch.attached_files : []
    const next = current.includes(path)
      ? current.filter((p) => p !== path)
      : [...current, path]
    setBatch({ ...batch, attached_files: next })
    saveBatchFields({ attached_files: next }).catch(() => {})
  }, [batch])

  // Per-lead draft index — keyed by lead_id so the Leads tab can show
  // sent/failed/ready pills next to each card, plus the actual failure reason
  // from Resend (rather than just an aggregate "5 failed" toast).
  const draftsByLeadId = useMemo(() => {
    const m = {}
    for (const d of drafts || []) {
      if (d?.lead_id) m[d.lead_id] = d
    }
    return m
  }, [drafts])

  const sendStats = useMemo(() => {
    const stats = { sent: 0, failed: 0, ready: 0, total: 0 }
    for (const d of drafts || []) {
      stats.total++
      if (d.status === 'sent') stats.sent++
      else if (d.status === 'failed') stats.failed++
      else if (d.status === 'draft_ready') stats.ready++
    }
    return stats
  }, [drafts])

  const leadTypeCounts = useMemo(() => {
    const counts = { shop: 0, agent: 0, partner: 0, other: 0 }
    for (const l of leads || []) {
      const t = l.lead_type || 'shop'
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [leads])

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

  const handleSaveAsTemplate = async (opts = {}) => {
    if (!batch) return
    const defaultName = batch.fair_name || batch.name || 'Untitled template'
    // When opts.silent is true (e.g. from the chat panel's "Use & save for fair"
    // shortcut), skip the prompt and use the fair name directly.
    const name = opts.silent
      ? defaultName
      : window.prompt('Name this template (e.g. "Vicenzaoro 2026 — shops"):', defaultName)
    if (!name || !name.trim()) return
    setError(null)
    try {
      const res = await fetch('/api/fair-assistant/saved-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          lead_type: 'shop',
          headline: batch.headline,
          paragraph1: batch.paragraph1,
          paragraph2: batch.paragraph2,
          signoff: batch.signoff,
          cta_line: batch.cta_line,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save template')
      await loadSavedTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleApplySavedTemplate = async (templateId) => {
    if (!templateId || !activeBatchId) return
    const tpl = savedTemplates.find((t) => t.id === templateId)
    if (!tpl) return
    setError(null)
    try {
      await saveBatchFields({
        headline: tpl.headline || '',
        paragraph1: tpl.paragraph1 || '',
        paragraph2: tpl.paragraph2 || '',
        signoff: tpl.signoff || '',
        cta_line: tpl.cta_line || '',
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteSavedTemplate = async (templateId) => {
    if (!templateId) return
    if (!window.confirm('Delete this saved template?')) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/saved-templates/${templateId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete template')
      await loadSavedTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaveLead = async () => {
    if (!editingLead) return
    setError(null)
    try {
      const { id, ...patch } = editingLead
      const res = await fetch(`/api/fair-assistant/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update lead')
      setEditingLead(null)
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteLead = async (leadId) => {
    if (!leadId) return
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/leads/${leadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete lead')
      setEditingLead(null)
      await loadBatchDetails(activeBatchId)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteBatch = async () => {
    if (!activeBatchId) return
    const batchName = batches.find((b) => b.id === activeBatchId)?.name || 'this batch'
    if (!window.confirm(`Delete "${batchName}" and all its photos, leads, and drafts? This cannot be undone.`)) return
    setError(null)
    try {
      const res = await fetch(`/api/fair-assistant/batches/${activeBatchId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete batch')
      setActiveBatchId(null)
      setBatch(null)
      setLeads([])
      setImages([])
      setDrafts([])
      await loadBatches()
    } catch (err) {
      setError(err.message)
    }
  }

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
    const files = Array.from(fileList)
    setUploading(true)
    setError(null)
    setUploadProgress({ done: 0, total: files.length, failed: 0 })
    const failures = []
    let completed = 0

    // Bound the number of in-flight uploads so we don't:
    //   - Saturate Drive's per-second API quota with 30+ parallel writes
    //   - Stall the browser keeping all FormData blobs in memory at once
    //   - Hammer n8n with concurrent webhooks faster than it processes them
    // 4 is the sweet spot found in testing: ~4x faster than serial, well
    // under Drive's ~10 req/sec ceiling, and the browser stays responsive.
    const CONCURRENCY = 4
    // Per-file timeout — a single Drive call hanging on 503 shouldn't
    // poison the whole batch. AbortController is cleaned up in `finally`.
    const PER_FILE_TIMEOUT_MS = 45000

    const uploadOne = async (file) => {
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
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PER_FILE_TIMEOUT_MS)
      try {
        const res = await fetch('/api/fair-assistant/upload', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        })
        let data
        try {
          data = await res.json()
        } catch {
          if (res.status === 413) {
            throw new Error(
              compressError
                ? `compression failed (${compressError}); original ${origKB} KB`
                : `sent ${sentKB} KB (original ${origKB} KB); Vercel limit ~4.5 MB`
            )
          }
          throw new Error(`HTTP ${res.status}`)
        }
        if (!res.ok) throw new Error(data.error || 'upload failed')
      } catch (err) {
        const msg = err?.name === 'AbortError' ? `timed out after ${PER_FILE_TIMEOUT_MS / 1000}s` : err.message
        failures.push({ name: file.name, error: msg })
      } finally {
        clearTimeout(timer)
      }
    }

    // Worker-pool pattern: a shared cursor advances through the file list
    // and each worker pulls the next file when it finishes. Cleaner than
    // splitting the array into N fixed chunks (which leaves workers idle
    // when their chunk has slow files) and avoids the all-or-nothing
    // semantics of Promise.all on an early failure.
    let cursor = 0
    const worker = async () => {
      while (true) {
        const idx = cursor++
        if (idx >= files.length) return
        await uploadOne(files[idx])
        completed++
        setUploadProgress({ done: completed, total: files.length, failed: failures.length })
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()))
      // Single reload at the end — the old "every 3 files" cadence was
      // firing three parallel Supabase queries each time, which compounded
      // into a stall once the batch had >20 images.
      await loadBatchDetails(activeBatchId)
      if (failures.length) {
        const summary = failures.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join(' · ')
        const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : ''
        setError(`${failures.length} of ${files.length} failed — ${summary}${more}`)
      } else if (files.length > 0) {
        setTab('leads')
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => setUploadProgress(null), 3000)
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

  // Force-flush the current batch form state to the server. Form fields save
  // on onBlur, but on iOS Safari tapping a button often doesn't trigger blur
  // on the previously-focused input — so the latest typed text never reaches
  // the server before Generate / Send runs. Call this at the top of any
  // action that depends on saved batch data.
  const flushPendingEdits = useCallback(async () => {
    if (!batch || !activeBatchId) return
    await saveBatchFields({
      subject: batch.subject ?? '',
      headline: batch.headline ?? '',
      paragraph1: batch.paragraph1 ?? '',
      paragraph2: batch.paragraph2 ?? '',
      signoff: batch.signoff ?? '',
      cta_line: batch.cta_line ?? '',
      button1_label: batch.button1_label ?? '',
      button1_url: batch.button1_url ?? '',
      button2_label: batch.button2_label ?? '',
      button2_url: batch.button2_url ?? '',
    }).catch((err) => {
      // Don't block the action on a flush failure — log and continue with
      // whatever the server already has.
      console.warn('[flushPendingEdits] save failed (continuing):', err.message)
    })
  }, [batch, activeBatchId])

  const runPreview = async () => {
    if (!activeBatchId) return
    setBusyAction('preview')
    setError(null)
    try {
      await flushPendingEdits()
      const res = await fetch('/api/fair-assistant/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // allowPlaceholder=true so the modal can render the brand shell even
        // when the batch has 0 leads yet — otherwise Sam taps the button and
        // gets a confusing "No leads available" error before he's uploaded.
        body: JSON.stringify({ batchId: activeBatchId, allowPlaceholder: true }),
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
      await flushPendingEdits()
      const res = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generate failed')
      await loadBatchDetails(activeBatchId)
      // Tell the user when some drafts had to fall back to English. Without
      // this they'd never know — the batch silently sends mixed-language.
      if (Array.isArray(data.translationWarnings) && data.translationWarnings.length) {
        const langs = [...new Set(data.translationWarnings.flatMap((w) => w.fellBackToEnglishFor))].join(', ')
        setError(`⚠️ ${data.translationWarnings.length} draft${data.translationWarnings.length === 1 ? '' : 's'} couldn't be translated (${langs}) — those will go out in English. Click again to retry, or send anyway.`)
      }
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
      await flushPendingEdits()
      const genRes = await fetch('/api/fair-assistant/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatchId }),
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Generate failed')

      // Auto-loop send until the server reports no drafts remaining. Each
      // /send call drains as many as it can within the Vercel 10s function
      // budget; for huge batches this just means a few extra round-trips.
      let totals = { sent: 0, failed: 0, skipped: 0 }
      let passes = 0
      while (true) {
        passes += 1
        if (passes > 20) throw new Error('Aborted after 20 send passes — too many drafts; check Resend quota.')
        const res = await fetch('/api/fair-assistant/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: activeBatchId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Send failed')
        totals.sent += data.sent || 0
        totals.failed += data.failed || 0
        totals.skipped += data.skipped || 0
        await loadBatchDetails(activeBatchId)
        if (!data.remaining) break
        setBusyAction(`send-loop-${data.remaining}`) // UI sees "Sending... 47 remaining"
      }
      setError(`Done — ${totals.sent} sent, ${totals.failed} failed, ${totals.skipped} skipped (no email).`)
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
    <div className="fa-page" style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 12px calc(24px + env(safe-area-inset-bottom)) 12px' : '24px 20px', WebkitOverflowScrolling: 'touch' }}>
      {/* iPhone polish — scoped to the Fair Assistant page only.
          16px font-size prevents iOS Safari from auto-zooming on focus,
          which made the form unusable on phones. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 767px) {
          .fa-page input,
          .fa-page textarea,
          .fa-page select {
            font-size: 16px !important;
          }
          .fa-page button {
            min-height: 40px;
          }
          .fa-modal-card {
            border-radius: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-height: 100vh !important;
            max-width: 100vw !important;
          }
          .fa-modal-overlay {
            padding: 0 !important;
            align-items: stretch !important;
          }
        }
      ` }} />
      {editingLead && (
        <div
          className="fa-modal-overlay"
          onClick={() => setEditingLead(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            className="fa-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: colors.inkPlum }}>Edit lead</h2>
              <button
                onClick={() => setEditingLead(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', fontSize: 24, color: colors.lovelabMuted, cursor: 'pointer', padding: 4, lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['first_name', 'First name'],
                ['last_name', 'Last name'],
                ['company', 'Company'],
                ['title', 'Title'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['mobile_phone', 'Mobile phone'],
                ['country', 'Country'],
                ['city', 'City'],
              ].map(([key, label]) => (
                <label key={key} style={{ fontSize: 12, color: colors.lovelabMuted }}>
                  <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>{label}</span>
                  <input
                    value={editingLead[key] || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, [key]: e.target.value })}
                    style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, boxSizing: 'border-box' }}
                  />
                </label>
              ))}
              <label style={{ fontSize: 12, color: colors.lovelabMuted }}>
                <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Lead type (changes which template is used for this lead)</span>
                <select
                  value={editingLead.lead_type || 'shop'}
                  onChange={(e) => setEditingLead({ ...editingLead, lead_type: e.target.value })}
                  style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, background: '#fff' }}
                >
                  {FAIR_LEAD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: colors.lovelabMuted }}>
                  {FAIR_LEAD_TYPES.find((t) => t.id === (editingLead.lead_type || 'shop'))?.hint}
                </span>
              </label>
              <label style={{ fontSize: 12, color: colors.lovelabMuted }}>
                <span style={{ display: 'block', marginBottom: 3, fontWeight: 600, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Language (override auto-detection)</span>
                <select
                  value={editingLead.language || ''}
                  onChange={(e) => {
                    const code = e.target.value
                    const labels = { en: 'English', fr: 'French', nl: 'Dutch', de: 'German', it: 'Italian', es: 'Spanish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', pl: 'Polish', el: 'Greek', tr: 'Turkish', he: 'Hebrew', 'fr+nl': 'French + Dutch', 'de+fr': 'German + French', 'fr+de': 'French + German', 'en+fr': 'English + French', 'de+it': 'German + Italian' }
                    setEditingLead({ ...editingLead, language: code, language_label: labels[code] || code })
                  }}
                  style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, background: '#fff' }}
                >
                  <option value="en">English</option>
                  <option value="it">Italian</option>
                  <option value="fr">French</option>
                  <option value="nl">Dutch</option>
                  <option value="de">German</option>
                  <option value="es">Spanish</option>
                  <option value="pt">Portuguese</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="pl">Polish</option>
                  <option value="el">Greek</option>
                  <option value="tr">Turkish</option>
                  <option value="he">Hebrew</option>
                  <option value="fr+nl">French + Dutch (Belgium)</option>
                  <option value="de+fr">German + French (Switzerland)</option>
                  <option value="fr+de">French + German (Luxembourg)</option>
                  <option value="en+fr">English + French (Canada)</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 8 }}>
              <button
                onClick={() => handleDeleteLead(editingLead.id)}
                style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 600, fontSize: 13 }}
              >Delete lead</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingLead(null)}
                  style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 600, fontSize: 13 }}
                >Cancel</button>
                <button
                  onClick={handleSaveLead}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontWeight: 700, fontSize: 13 }}
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            {activeBatchId && (
              <button
                onClick={handleDeleteBatch}
                title="Delete this batch"
                aria-label="Delete this batch"
                style={{ padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                </svg>
                Delete batch
              </button>
            )}
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
            {/* Journey stepper — shows where the user is in the workflow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: colors.lovelabMuted, flexWrap: 'wrap' }}>
              {TABS.map((t, idx) => {
                const isActive = tab === t.id
                const stepCount = t.id === 'upload' ? images.length : t.id === 'leads' ? leads.length : (batch?.total_sent || 0)
                const stepLabels = ['Upload cards', 'Review leads', 'Send outreach']
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setTab(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 14, border: 'none', background: 'transparent',
                        color: isActive ? colors.inkPlum : colors.lovelabMuted, cursor: 'pointer', fontWeight: isActive ? 700 : 500,
                        fontSize: 12, fontFamily: fonts.body,
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: '50%',
                        background: isActive ? colors.inkPlum : '#e8dfee',
                        color: isActive ? '#fff' : colors.inkPlum, fontWeight: 700, fontSize: 11,
                      }}>{idx + 1}</span>
                      <span>{stepLabels[idx]}{stepCount > 0 ? ` (${stepCount})` : ''}</span>
                    </button>
                    {idx < TABS.length - 1 && <span style={{ color: '#d0c4d6' }}>›</span>}
                  </div>
                )
              })}
            </div>

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
                <p style={{ marginTop: 0, color: colors.textLight, fontSize: 14 }}>Pick photos from your library, the camera, or files — multi-select supported (you can grab the whole roll). Each one is uploaded to Drive and processed automatically.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {uploading
                      ? (uploadProgress ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…` : 'Uploading…')
                      : 'Pick photos'}
                  </button>
                </div>

                {uploadProgress && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: colors.lovelabMuted, marginBottom: 4 }}>
                      <span>
                        {uploadProgress.done} of {uploadProgress.total} uploaded
                        {uploadProgress.failed > 0 && <span style={{ color: '#dc2626' }}> · {uploadProgress.failed} failed</span>}
                      </span>
                      <span>{Math.round((uploadProgress.done / uploadProgress.total) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: '#f1ecf3', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(uploadProgress.done / uploadProgress.total) * 100}%`,
                        background: colors.inkPlum,
                        transition: 'width .2s',
                      }} />
                    </div>
                  </div>
                )}

                {images.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Photos in this batch</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {images.map((img, i) => {
                        const createdAtMs = img.created_at ? new Date(img.created_at).getTime() : Date.now()
                        const ageMin = (Date.now() - createdAtMs) / 60000
                        const isStuck = img.status === 'processing' && ageMin > 5
                        const isDuplicate = img.status === 'processed' && typeof img.error === 'string' && /duplicate/i.test(img.error)
                        const statusColor =
                          isDuplicate ? '#0891b2' :
                          img.status === 'processed' ? '#16a34a' :
                          img.status === 'failed' ? '#dc2626' :
                          isStuck ? '#dc2626' :
                          img.status === 'processing' ? '#ca8a04' : colors.lovelabMuted
                        const statusLabel =
                          isDuplicate ? '✓ duplicate' :
                          img.status === 'processed' ? '✓ done' :
                          img.status === 'failed' ? '✗ failed' :
                          isStuck ? `⚠ stuck (${Math.floor(ageMin)}m)` :
                          img.status === 'processing' ? '⋯ processing' : img.status
                        return (
                          <div key={img.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 10px', background: isStuck ? '#fef2f2' : isDuplicate ? '#ecfeff' : '#fafafa', borderRadius: 6, border: isStuck ? '1px solid #fecaca' : isDuplicate ? '1px solid #a5f3fc' : '1px solid transparent', flexWrap: 'wrap' }}>
                            <span style={{ color: colors.lovelabMuted, minWidth: 24 }}>#{i + 1}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.file_name || 'card.jpg'}</span>
                            <span style={{ color: statusColor, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                            {isStuck && (
                              <button
                                onClick={() => handleMarkImageDuplicate(img.id, img.file_name)}
                                title="Mark this stuck photo as a duplicate already in Salesforce"
                                style={{ background: '#fff', border: `1px solid #0891b2`, color: '#0891b2', cursor: 'pointer', padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, minHeight: 28, fontFamily: fonts.body, whiteSpace: 'nowrap' }}
                              >
                                ✓ Already in SF
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteImage(img.id, img.file_name)}
                              title={isStuck ? 'Delete stuck photo' : 'Delete photo from batch'}
                              aria-label="Delete photo"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4, minHeight: 28 }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
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

                {leads.length > 0 && !uploading && (
                  <button
                    onClick={() => setTab('leads')}
                    style={{
                      width: '100%', padding: '14px 16px', minHeight: 48, borderRadius: 10,
                      border: 'none', background: '#16a34a', color: '#fff',
                      fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: fonts.body,
                      marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    Done — review {leads.length} lead{leads.length === 1 ? '' : 's'} →
                  </button>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: colors.lovelabMuted, borderTop: `1px solid ${colors.borderLight || colors.border}`, paddingTop: 12 }}>
                  <span><strong style={{ color: colors.inkPlum, fontSize: 16 }}>{images.length}</strong> photo{images.length === 1 ? '' : 's'} in this batch</span>
                  <span>{batch?.total_leads || 0} lead{(batch?.total_leads || 0) === 1 ? '' : 's'} extracted</span>
                </div>
              </div>
            )}

            {tab === 'leads' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
                {/* Lead-type breakdown — explicitly shows that agents/partners are getting
                    different emails than shops. Without this the per-type behavior was
                    invisible and Sam thought everyone was getting the same email. */}
                {(leadTypeCounts.agent > 0 || leadTypeCounts.partner > 0) && (
                  <div style={{ marginBottom: 12, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#075985' }}>
                    <strong style={{ display: 'block', marginBottom: 4 }}>📨 This batch will send three different emails</strong>
                    <div>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{leadTypeCounts.shop + (leadTypeCounts.other || 0)}</span> shop email{(leadTypeCounts.shop + (leadTypeCounts.other || 0)) === 1 ? '' : 's'} (the template you edit in Outreach)
                      {leadTypeCounts.agent > 0 && <> · <span style={{ color: '#92400e', fontWeight: 700 }}>{leadTypeCounts.agent}</span> agent intro (partnership tone, no product push)</>}
                      {leadTypeCounts.partner > 0 && <> · <span style={{ color: '#1e40af', fontWeight: 700 }}>{leadTypeCounts.partner}</span> partnership intro</>}
                    </div>
                  </div>
                )}

                {/* Send results — surfaces failure count and lets Sam see WHICH leads
                    bounced. The per-card pills below give the per-lead detail. */}
                {sendStats.total > 0 && (sendStats.sent > 0 || sendStats.failed > 0) && (
                  <div style={{ marginBottom: 12, padding: 10, background: sendStats.failed > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${sendStats.failed > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>Last send:</span>
                    <span style={{ color: '#166534' }}>✓ {sendStats.sent} sent</span>
                    {sendStats.failed > 0 && <span style={{ color: '#991b1b', fontWeight: 700 }}>✗ {sendStats.failed} failed</span>}
                    {sendStats.ready > 0 && <span style={{ color: '#6b21a8' }}>○ {sendStats.ready} pending</span>}
                    {sendStats.failed > 0 && (
                      <span style={{ color: '#6b7280', fontSize: 11 }}>Tap a red card below to see why each one failed.</span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, flex: isMobile ? '1 1 calc(50% - 4px)' : 'unset', fontSize: 14, background: '#fff' }}>
                    <option value="">All countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, flex: isMobile ? '1 1 calc(50% - 4px)' : 'unset', fontSize: 14, background: '#fff' }}>
                    <option value="">All languages</option>
                    {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                {/* Mobile: stacked tappable cards. Desktop: keep the table. */}
                {isMobile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredLeads.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 14 }}>
                        No leads yet. Upload card photos to begin.
                      </div>
                    ) : filteredLeads.map((lead) => {
                      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'
                      const typeColor = lead.lead_type === 'agent' ? { bg: '#fef3c7', fg: '#92400e' }
                        : lead.lead_type === 'partner' ? { bg: '#dbeafe', fg: '#1e40af' }
                        : { bg: '#f3f4f6', fg: '#374151' }
                      const draft = draftsByLeadId[lead.id]
                      const draftStatus = draft?.status || null
                      const draftError = draft?.error || null
                      const sendPill = draftStatus === 'sent'
                          ? { bg: '#dcfce7', fg: '#166534', label: '✓ sent' }
                        : draftStatus === 'failed'
                          ? { bg: '#fee2e2', fg: '#991b1b', label: '✗ send failed' }
                        : draftStatus === 'draft_ready'
                          ? { bg: '#f3e8ff', fg: '#6b21a8', label: '○ draft ready' }
                        : null
                      return (
                        <div
                          key={lead.id}
                          onClick={() => {
                            if (draftStatus === 'failed' && draftError) {
                              showToast(`Send failed: ${draftError.slice(0, 200)}`)
                            }
                            setEditingLead({ ...lead })
                          }}
                          style={{
                            position: 'relative',
                            padding: 14,
                            border: `1px solid ${draftStatus === 'failed' ? '#fecaca' : colors.border}`,
                            borderRadius: 10,
                            background: draftStatus === 'failed' ? '#fef2f2' : '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                              {lead.company && <div style={{ fontSize: 13, color: colors.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                              {lead.lead_type && lead.lead_type !== 'shop' && (
                                <span style={{ fontSize: 10, padding: '3px 8px', background: typeColor.bg, color: typeColor.fg, borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                                  {lead.lead_type}
                                </span>
                              )}
                              {sendPill && (
                                <span style={{ fontSize: 10, padding: '3px 8px', background: sendPill.bg, color: sendPill.fg, borderRadius: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {sendPill.label}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: colors.textLight, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.email || '—'}
                          </div>
                          {draftStatus === 'failed' && draftError && (
                            <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8, padding: '6px 8px', background: '#fee2e2', borderRadius: 6, lineHeight: 1.4 }}>
                              <strong>Why it failed:</strong> {draftError.slice(0, 240)}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.lovelabMuted, flexWrap: 'wrap' }}>
                            <span>📍 {lead.country || '—'}</span>
                            <span>·</span>
                            <span>🗣 {lead.language_label || lead.language || '—'}</span>
                            <span>·</span>
                            <span style={{ color: lead.status === 'extracted' ? '#16a34a' : lead.status === 'failed' ? '#dc2626' : colors.lovelabMuted, fontWeight: 600 }}>{lead.status}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id) }}
                              title="Delete lead"
                              aria-label="Delete lead"
                              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 6, display: 'flex', alignItems: 'center', minHeight: 32 }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
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
                          <th style={{ padding: 8, width: 50 }}></th>
                          <th style={{ padding: 8, width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.map((lead) => (
                          <tr
                            key={lead.id}
                            onClick={() => setEditingLead({ ...lead })}
                            style={{ borderBottom: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#faf8fc' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ padding: 8 }}>
                              {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                              {lead.lead_type && lead.lead_type !== 'shop' && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', background: lead.lead_type === 'agent' ? '#fef3c7' : lead.lead_type === 'partner' ? '#dbeafe' : '#f3f4f6', color: lead.lead_type === 'agent' ? '#92400e' : lead.lead_type === 'partner' ? '#1e40af' : '#374151', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {lead.lead_type}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: 8 }}>{lead.company || '—'}</td>
                            <td style={{ padding: 8 }}>{lead.country || '—'}</td>
                            <td style={{ padding: 8 }}>{lead.language_label || lead.language || '—'}</td>
                            <td style={{ padding: 8 }}>{lead.email || '—'}</td>
                            <td style={{ padding: 8 }}>{lead.status}</td>
                            <td style={{ padding: 8, color: colors.inkPlum, fontSize: 12, fontWeight: 600 }}>Edit</td>
                            <td style={{ padding: 4 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id) }}
                                title="Delete lead"
                                aria-label="Delete lead"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 6, display: 'flex', alignItems: 'center' }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!filteredLeads.length && (
                          <tr><td colSpan={8} style={{ padding: 16, color: colors.lovelabMuted }}>No leads yet. Upload card photos to begin.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'outreach' && batch && (() => {
              // ── Section definitions for the form column ──────────────────
              const sections = [
                {
                  id: 'content',
                  title: 'Email content',
                  icon: '📝',
                  description: 'The text Alberto wants the recipient to read.',
                  fields: [
                    { key: 'subject', label: 'Email subject line', kind: 'input', hint: 'What recipients see in their inbox. Defaults to your headline if blank. Use {fairName}, {firstName}, {company} for personalization.', placeholder: 'Following up from {fairName}' },
                    { key: 'headline', label: 'Headline', kind: 'input', hint: 'The big serif title inside the email. The fair name shows as a gold subtitle automatically — no need to repeat it here.' },
                    { key: 'paragraph1', label: 'Paragraph 1', kind: 'textarea', rows: 4 },
                    { key: 'paragraph2', label: 'Paragraph 2', kind: 'textarea', rows: 5 },
                    { key: 'signoff', label: 'Signoff', kind: 'textarea', rows: 3 },
                  ],
                },
                {
                  id: 'buttons',
                  title: 'Call-to-action buttons',
                  icon: '🔗',
                  description: 'Two pill buttons sit between paragraph 1 and 2. Clear Button 2 to hide it.',
                  fields: [
                    { key: 'button1_label', label: 'Button 1 label (filled)', kind: 'input', placeholder: 'Visit Our Website' },
                    { key: 'button1_url',   label: 'Button 1 URL',           kind: 'input', placeholder: 'https://lovelab.be/' },
                    { key: 'button2_label', label: 'Button 2 label (outline)', kind: 'input', placeholder: 'B2B Login' },
                    { key: 'button2_url',   label: 'Button 2 URL',             kind: 'input', placeholder: 'https://lovelab.be/b2b-signup' },
                  ],
                },
                {
                  id: 'advanced',
                  title: 'Extras',
                  icon: '⚙️',
                  description: 'Optional. Auto-hidden if it just mentions lovelab.be (buttons already say it).',
                  fields: [
                    { key: 'cta_line', label: 'Extra CTA sentence', kind: 'textarea', rows: 2 },
                  ],
                },
              ]

              const customHtmlActive = Boolean(batch.custom_html && batch.custom_html.trim())

              const copyToClipboard = async (text) => {
                try {
                  await navigator.clipboard.writeText(text)
                } catch {
                  // Fallback for older browsers / iOS quirks
                  const ta = document.createElement('textarea')
                  ta.value = text
                  document.body.appendChild(ta)
                  ta.select()
                  document.execCommand('copy')
                  document.body.removeChild(ta)
                }
              }

              const attachedSet = new Set(Array.isArray(batch.attached_files) ? batch.attached_files : [])
              const attachedCount = attachedSet.size

              const fieldInput = (field) => (
                field.kind === 'textarea' ? (
                  <textarea
                    value={batch[field.key] || ''}
                    onChange={(e) => setBatch({ ...batch, [field.key]: e.target.value })}
                    onBlur={() => saveBatchFields({ [field.key]: batch[field.key] })}
                    rows={field.rows || 3}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, resize: 'vertical', fontSize: 14, boxSizing: 'border-box' }}
                  />
                ) : (
                  <input
                    value={batch[field.key] || ''}
                    onChange={(e) => setBatch({ ...batch, [field.key]: e.target.value })}
                    onBlur={() => saveBatchFields({ [field.key]: batch[field.key] })}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, fontSize: 14, boxSizing: 'border-box' }}
                  />
                )
              )

              const formColumn = (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Hero: chat is the primary way to build emails. Everything below
                      is a manual escape hatch. */}
                  <button
                    onClick={() => setChatOpen(true)}
                    style={{
                      width: '100%',
                      padding: isMobile ? '18px 20px' : '22px 24px',
                      borderRadius: 14,
                      border: 'none',
                      background: `linear-gradient(135deg, ${colors.inkPlum} 0%, #8b5e92 100%)`,
                      color: '#fff',
                      cursor: 'pointer',
                      fontFamily: fonts.body,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      boxShadow: '0 4px 16px rgba(93,58,94,0.25)',
                    }}
                  >
                    <div style={{ fontSize: isMobile ? 26 : 30, lineHeight: 1 }}>✨</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, marginBottom: 2 }}>Build this email with Claude</div>
                      <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
                        Describe what you want — Claude writes the copy, picks images, drafts the HTML. You approve.
                      </div>
                    </div>
                    <div style={{ fontSize: 22, opacity: 0.7 }}>→</div>
                  </button>

                  {/* Quick-start: preset templates + Claude chat */}
                  <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>🚀 Start from a preset</h3>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {FAIR_OUTREACH_TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => applyTemplate(t.id)}
                          style={{
                            padding: '6px 12px', borderRadius: 14, border: `1px solid ${batch.template_id === t.id ? colors.inkPlum : colors.border}`,
                            background: batch.template_id === t.id ? '#f8f0fa' : '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12,
                            color: batch.template_id === t.id ? colors.inkPlum : colors.text, fontWeight: batch.template_id === t.id ? 600 : 400,
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${colors.borderLight || '#eee'}` }}>
                      {savedTemplates.length > 0 ? (
                        <select
                          onChange={(e) => { if (e.target.value) handleApplySavedTemplate(e.target.value); e.target.value = '' }}
                          defaultValue=""
                          style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: fonts.body, fontSize: 12, background: '#fff', flex: 1, minWidth: 180 }}
                        >
                          <option value="" disabled>📁 My saved templates ({savedTemplates.length})…</option>
                          {savedTemplates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}{t.lead_type !== 'shop' ? ` · ${t.lead_type}` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, color: colors.lovelabMuted, flex: 1 }}>No saved templates yet — save the current draft for next fair.</span>
                      )}
                      <button
                        onClick={handleSaveAsTemplate}
                        style={{ padding: '7px 12px', borderRadius: 14, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
                      >
                        💾 Save current
                      </button>
                      <button onClick={() => setChatOpen(true)} style={{ padding: '7px 12px', borderRadius: 14, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}>
                        ✨ Chat with Claude
                      </button>
                      <button onClick={handleClearAllFields} style={{ padding: '7px 12px', borderRadius: 14, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}>
                        🧹 Start fresh
                      </button>
                    </div>
                    {savedTemplates.length > 0 && (
                      <details style={{ marginTop: 10, fontSize: 11, color: colors.lovelabMuted }}>
                        <summary style={{ cursor: 'pointer' }}>Manage saved templates</summary>
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {savedTemplates.map((t) => (
                            <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                              <span style={{ flex: 1 }}>{t.name} · <em style={{ color: colors.lovelabMuted }}>{t.lead_type}</em></span>
                              <button onClick={() => handleApplySavedTemplate(t.id)} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer' }}>Apply</button>
                              <button onClick={() => handleDeleteSavedTemplate(t.id)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: `1px solid #fecaca`, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>Delete</button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  {/* Email content section — always visible, the primary editing surface */}
                  {(() => {
                    const contentSection = sections.find((s) => s.id === 'content')
                    if (!contentSection) return null
                    return (
                      <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                        <div style={{ marginBottom: 12 }}>
                          <h3 style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{contentSection.icon}</span> {contentSection.title}
                          </h3>
                          <p style={{ margin: 0, fontSize: 11, color: colors.lovelabMuted }}>{contentSection.description}</p>
                        </div>
                        {contentSection.fields.map((field) => (
                          <label key={field.key} style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: colors.inkPlum }}>{field.label}</span>
                            {field.hint && <span style={{ display: 'block', marginBottom: 6, fontSize: 11, color: colors.lovelabMuted }}>{field.hint}</span>}
                            {fieldInput(field)}
                          </label>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Advanced sections — collapsed by default to keep the page calm. */}
                  {sections.filter((s) => s.id !== 'content').map((section) => (
                    <details key={section.id} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 0 }}>
                      <summary style={{ cursor: 'pointer', padding: 16, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{section.icon}</span> {section.title}
                        </span>
                        <span style={{ fontSize: 11, color: colors.lovelabMuted, fontWeight: 400, marginLeft: 'auto' }}>{section.description}</span>
                      </summary>
                      <div style={{ padding: '0 16px 16px' }}>
                        {section.fields.map((field) => (
                          <label key={field.key} style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: colors.inkPlum }}>{field.label}</span>
                            {field.hint && <span style={{ display: 'block', marginBottom: 6, fontSize: 11, color: colors.lovelabMuted }}>{field.hint}</span>}
                            {fieldInput(field)}
                          </label>
                        ))}
                      </div>
                    </details>
                  ))}

                  {/* Custom HTML body and Image library are intentionally hidden from
                      the Outreach UI per Sam (2026-05): too complex for the day-to-day
                      workflow and Claude couldn't render HTML previews in chat anyway.
                      The custom_html column + image-library API still exist; if any
                      batch has custom_html set, it still renders correctly. Re-add the
                      UI when there's a real workflow that needs it. */}

                  {/* Attachments section — PDFs from the B2B homepage */}
                  <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        📎 Attachments
                        {attachedCount > 0 && <span style={{ background: colors.inkPlum, color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{attachedCount}</span>}
                      </h3>
                      <p style={{ margin: 0, fontSize: 11, color: colors.lovelabMuted }}>Pick PDFs / Excels to attach to every email in this batch. Same files as your B2B home page.</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {B2B_RESOURCE_GROUPS.map((group) => (
                        <details key={group.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8 }}>
                          <summary style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: colors.inkPlum, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {group.label}
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: colors.lovelabMuted, fontWeight: 400 }}>
                              {group.files.filter((f) => attachedSet.has(f.path)).length} / {group.files.length} selected
                            </span>
                          </summary>
                          <div style={{ padding: '4px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {group.files.map((f) => {
                              const checked = attachedSet.has(f.path)
                              return (
                                <label key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: checked ? '#f8f0fa' : 'transparent', border: `1px solid ${checked ? colors.inkPlum + '44' : 'transparent'}`, fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAttachment(f.path)}
                                    style={{ accentColor: colors.inkPlum, cursor: 'pointer' }}
                                  />
                                  <span style={{ flex: 1, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, position: 'sticky', bottom: 8, boxShadow: '0 -4px 14px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={runPreview} disabled={busyAction === 'preview'} style={{ ...actionBtnStyle, fontSize: 13 }}>
                        {busyAction === 'preview' ? 'Loading…' : '👁 Preview email'}
                      </button>
                      <button onClick={runGenerateAll} disabled={busyAction === 'generate'} style={{ ...actionBtnStyle, fontSize: 13 }}>
                        {busyAction === 'generate' ? 'Generating…' : 'Generate drafts'}
                      </button>
                      <button
                        onClick={runSend}
                        disabled={(busyAction && busyAction.startsWith('send')) || uploading || leads.length === 0}
                        title={
                          uploading ? 'Wait for uploads to finish' :
                          leads.length === 0 ? 'No leads in this batch yet' :
                          ''
                        }
                        style={{ ...actionBtnStyle, background: (uploading || leads.length === 0) ? '#c5b9cf' : colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700, flex: '1 1 auto', minWidth: 180, cursor: (uploading || leads.length === 0) ? 'not-allowed' : 'pointer' }}
                      >
                        {busyAction === 'send' ? 'Sending…'
                          : busyAction?.startsWith('send-loop-') ? `Sending… ${busyAction.replace('send-loop-', '')} remaining`
                          : uploading ? 'Wait for uploads…'
                          : leads.length === 0 ? 'No leads yet'
                          : `Send to ${leads.length} lead${leads.length === 1 ? '' : 's'}${attachedCount > 0 ? ` · ${attachedCount} attachment${attachedCount === 1 ? '' : 's'}` : ''}`}
                      </button>
                    </div>
                  </div>
                </div>
              )

              const previewPanel = (
                <div style={{
                  background: '#FDF7FA',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  height: 'calc(100vh - 180px)',
                  position: 'sticky',
                  top: 16,
                }}>
                  <div style={{ padding: '10px 14px', background: '#fff', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live preview</span>
                    {livePreviewLoading && <span style={{ fontSize: 11, color: colors.lovelabMuted }}>• updating…</span>}
                    <button
                      onClick={() => setShowLivePreview((v) => !v)}
                      style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', cursor: 'pointer', fontFamily: fonts.body, color: colors.text }}
                    >
                      Hide
                    </button>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', background: '#FDF7FA' }}>
                    {leads.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>
                        Upload at least one card and let n8n extract a lead — live preview needs a recipient to render the greeting.
                      </div>
                    ) : livePreviewHtml ? (
                      <iframe
                        title="Email live preview"
                        srcDoc={livePreviewHtml}
                        sandbox=""
                        style={{ width: '100%', height: '100%', minHeight: '100%', border: 'none', background: '#FDF7FA' }}
                      />
                    ) : (
                      <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>Loading preview…</div>
                    )}
                  </div>
                </div>
              )

              const mobilePreviewSheet = showLivePreview && (
                <div className="fa-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowLivePreview(false)}>
                  <div className="fa-modal-card" style={{ background: '#fff', width: '100%', height: '92vh', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ padding: '12px 16px', background: '#fff', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live preview</span>
                      {livePreviewLoading && <span style={{ fontSize: 11, color: colors.lovelabMuted }}>• updating…</span>}
                      <button
                        onClick={() => setShowLivePreview(false)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: colors.text, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                      >×</button>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', background: '#FDF7FA' }}>
                      {leads.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 14 }}>
                          Upload at least one card to enable the preview.
                        </div>
                      ) : livePreviewHtml ? (
                        <iframe
                          title="Email live preview"
                          srcDoc={livePreviewHtml}
                          sandbox=""
                          style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                      ) : (
                        <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 14 }}>Loading preview…</div>
                      )}
                    </div>
                  </div>
                </div>
              )

              const mobilePreviewFAB = isMobile && leads.length > 0 && !showLivePreview && (
                <button
                  onClick={() => setShowLivePreview(true)}
                  style={{
                    position: 'fixed',
                    right: 16,
                    bottom: `calc(20px + env(safe-area-inset-bottom))`,
                    zIndex: 900,
                    padding: '12px 18px',
                    borderRadius: 28,
                    border: 'none',
                    background: colors.inkPlum,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(93,58,94,0.4)',
                    fontFamily: fonts.body,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  👁 Preview
                </button>
              )

              return (
                <>
                  {isMobile ? (
                    <>
                      {formColumn}
                      {mobilePreviewFAB}
                      {mobilePreviewSheet}
                    </>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                      gap: 16,
                      alignItems: 'start',
                    }}>
                      {formColumn}
                      {previewPanel}
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </div>

      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: 'fixed',
            bottom: `calc(88px + env(safe-area-inset-bottom))`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            background: 'rgba(33, 24, 38, 0.95)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 24,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: fonts.body,
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          {toast}
        </div>
      )}

      {previewOpen && (
        <div className="fa-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewOpen(false)}>
          <div className="fa-modal-card" style={{ background: '#fff', width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
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
        onSaveAsTemplate={handleSaveAsTemplate}
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
