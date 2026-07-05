'use client'

/**
 * Admin — Organization detail.
 *
 * The same accumulated TeamDashboard the org owner sees on /agent/team,
 * plus admin-only controls:
 *   - edit org settings (name, territory, commission rate, conditions)
 *   - invite members OR additional owners
 *   - pause/remove any member (including owners)
 *   - jump to each agent's /admin/agents/[id] detail page
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import TeamDashboard from '@/app/components/TeamDashboard'
import { colors } from '@/lib/styles'

export default function AdminOrganizationDetailPage() {
  const { id: organizationId } = useParams()
  const router = useRouter()

  const [organization, setOrganization] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Settings editing
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', territory: '', commission_rate: '', conditions: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizations/${organizationId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'load_failed')
      setOrganization(data.organization)
      setForm({
        name: data.organization?.name || '',
        territory: data.organization?.territory || '',
        commission_rate: data.organization?.commission_rate ?? '',
        conditions: data.organization?.conditions || '',
      })
    } catch (e) {
      setError(e.message === 'load_failed' ? 'Failed to load organization.' : e.message)
    }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { if (organizationId) load() }, [organizationId, load])

  const saveSettings = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: form.name,
        territory: form.territory || null,
        commission_rate: form.commission_rate === '' ? null : Number(form.commission_rate),
        conditions: form.conditions || null,
      }
      const res = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setOrganization(data.organization)
      setEditing(false)
    } catch (e) {
      setSaveError(e.message)
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.lovelabMuted }}>Loading organization...</div>
  }

  if (error || !organization) {
    return (
      <div style={{ flex: 1, padding: 32 }}>
        <div style={{ padding: 14, background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
          {error || 'Organization not found.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header + settings */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <button
              onClick={() => router.push('/admin/organizations')}
              style={{ background: 'none', border: 'none', color: colors.lovelabMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 6 }}
            >
              ← All organizations
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.inkPlum, margin: 0 }}>{organization.name}</h1>
            <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 4 }}>
              {organization.territory || 'No territory set'}
              {organization.commission_rate != null && ` · ${organization.commission_rate}% org rate`}
            </div>
          </div>
          <button
            onClick={() => { setEditing(v => !v); setSaveError(null) }}
            style={{ padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${colors.inkPlum}`, background: editing ? colors.inkPlum : '#fff', color: editing ? '#fff' : colors.inkPlum, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {editing ? 'Close settings' : 'Edit settings'}
          </button>
        </div>

        {editing && (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
              <Field label="Organization name">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Territory">
                <input value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} placeholder="e.g. France" style={inputStyle} />
              </Field>
              <Field label="Commission rate (%)">
                <input type="number" min="0" max="100" value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: e.target.value }))} style={inputStyle} />
              </Field>
            </div>
            <Field label="Conditions / notes">
              <textarea value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))} rows={2} style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
            </Field>
            {saveError && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{saveError}</div>}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={saveSettings}
                disabled={saving || !form.name.trim()}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: saving || !form.name.trim() ? '#ccc' : colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </div>
        )}

        <TeamDashboard organizationId={organizationId} adminView />
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', height: 38,
}
