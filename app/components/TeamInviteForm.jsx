'use client'

/**
 * TeamInviteForm — invite one or many members to an organization.
 *
 * Extracted from TeamDashboard so /admin/organizations/[id] can offer the same
 * invite flow inside its single Members table without rendering the whole
 * dashboard. Renders bare (no card chrome); callers decide the framing.
 *
 * Props:
 *   organizationId — required
 *   adminView      — shows the "invite as owner" checkbox (admin only)
 *   onInvited      — called after every invite attempt so the caller can reload
 */

import { useState } from 'react'
import { colors } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'

const parseEmails = (raw) =>
  [...new Set(
    String(raw || '')
      .split(/[\s,;\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )]

export default function TeamInviteForm({ organizationId, adminView = false, onInvited }) {
  const { t } = useI18n()

  const [inviteInput, setInviteInput] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState(null)

  const handleInvite = async () => {
    const emails = parseEmails(inviteInput)
    if (emails.length === 0) return
    setInviting(true)
    setInviteFeedback(null)
    try {
      const body = emails.length === 1
        ? { email: emails[0], role: inviteRole }
        : { emails, role: inviteRole }
      const res = await fetch(`/api/organizations/${organizationId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (emails.length === 1) {
        if (res.ok) {
          setInviteFeedback({ ok: true, message: t('team.inviteSuccess', { email: emails[0] }) })
          setInviteInput('')
        } else {
          setInviteFeedback({ ok: false, message: data.error || t('team.inviteFailed') })
        }
      } else {
        const failed = (data.results || []).filter((r) => !r.ok)
        setInviteFeedback({
          ok: failed.length === 0,
          message: t('team.inviteSummary', {
            ok: data.invited_count ?? 0,
            failed: data.failed_count ?? failed.length,
          }),
          details: failed.map((f) => `${f.email}: ${f.error}`),
        })
        if (failed.length === 0) setInviteInput('')
      }
      if (onInvited) await onInvited()
    } catch {
      setInviteFeedback({ ok: false, message: t('team.inviteFailed') })
    }
    setInviting(false)
  }

  if (!organizationId) return null

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        {t('team.inviteTitle')}
      </div>
      <textarea
        data-testid="team-invite-input"
        value={inviteInput}
        onChange={(e) => setInviteInput(e.target.value)}
        placeholder={t('team.invitePlaceholder')}
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          data-testid="team-invite-submit"
          onClick={handleInvite}
          disabled={inviting || parseEmails(inviteInput).length === 0}
          style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: inviting || parseEmails(inviteInput).length === 0 ? '#ccc' : colors.inkPlum,
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: inviting || parseEmails(inviteInput).length === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {inviting ? t('team.sending') : t('team.sendInvites')}
        </button>
        {adminView && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.charcoal }}>
            <input
              type="checkbox"
              checked={inviteRole === 'owner'}
              onChange={(e) => setInviteRole(e.target.checked ? 'owner' : 'member')}
            />
            Invite as organization owner
          </label>
        )}
        <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{t('team.inviteHint')}</span>
      </div>
      {inviteFeedback && (
        <div
          data-testid="team-invite-feedback"
          style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: inviteFeedback.ok ? '#f0fdf4' : '#fef2f2', color: inviteFeedback.ok ? '#15803d' : '#dc2626' }}
        >
          <div>{inviteFeedback.message}</div>
          {(inviteFeedback.details || []).map((line, i) => (
            <div key={i} style={{ marginTop: 2 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
