/**
 * What the Photos list says about each card photo, in plain words.
 *
 * A photo is "stuck" when it has been processing for more than STUCK_AFTER_MIN
 * minutes: the card reader (n8n) normally answers in under 30 seconds. The
 * wording is for the person at the fair, not for a developer.
 */
export const STUCK_AFTER_MIN = 5

const DUPLICATE_RE = /duplicate/i

export function describeImage(img, now = Date.now()) {
  // A retry restarts the clock: while processing, the last touch (updated_at) is when the card reader was last asked.
  const since = (img?.status === 'processing' && img?.updated_at) || img?.created_at
  const createdMs = since ? new Date(since).getTime() : now
  const ageMin = Math.max(0, Math.floor((now - createdMs) / 60000))
  const status = img?.status

  if (status === 'processed') {
    if (typeof img.error === 'string' && DUPLICATE_RE.test(img.error)) {
      return {
        key: 'duplicate', tone: 'info', label: '✓ already in Salesforce', stuck: false, ageMin,
        detail: 'Already in Salesforce. No lead is added here, so this contact gets no follow-up email from this batch.',
      }
    }
    return { key: 'done', tone: 'ok', label: '✓ done', stuck: false, ageMin, detail: 'Lead created.' }
  }

  if (status === 'processing') {
    if (ageMin > STUCK_AFTER_MIN) {
      return {
        key: 'stuck', tone: 'bad', label: `⚠ no answer (${ageMin} min)`, stuck: true, ageMin,
        detail: `The card reader has not answered for ${ageMin} minutes. Try again first. If the contact is already in Salesforce, choose "Already in Salesforce" instead.`,
      }
    }
    return { key: 'processing', tone: 'warn', label: '⋯ reading card', stuck: false, ageMin, detail: 'Reading the card. Usually under 30 seconds.' }
  }

  if (status === 'failed') {
    return {
      key: 'failed', tone: 'bad', label: '✗ failed', stuck: false, ageMin,
      detail: (typeof img.error === 'string' && img.error.trim()) || 'This photo could not be read. Delete the photo and upload it again.',
    }
  }

  return { key: status || 'unknown', tone: 'muted', label: status || 'unknown', stuck: false, ageMin, detail: '' }
}

export function summarizeImages(images, now = Date.now()) {
  const out = { total: 0, done: 0, duplicate: 0, processing: 0, stuck: 0, failed: 0, oldestStuckMin: 0 }
  for (const img of images || []) {
    const d = describeImage(img, now)
    out.total += 1
    if (d.key === 'done') out.done += 1
    else if (d.key === 'duplicate') out.duplicate += 1
    else if (d.key === 'processing') out.processing += 1
    else if (d.key === 'stuck') { out.stuck += 1; out.oldestStuckMin = Math.max(out.oldestStuckMin, d.ageMin) }
    else if (d.key === 'failed') out.failed += 1
  }
  return out
}

const BATCH_STATUS = {
  uploading: 'Uploading', extracting: 'Reading cards', extracted: 'Leads ready', drafting: 'Drafts ready',
  generating: 'Writing emails', sending: 'Sending', complete: 'Sent', failed: 'Failed', stuck: 'Stuck',
}
export function batchStatusLabel(status) {
  if (!status) return ''
  return BATCH_STATUS[status] || status
}

/**
 * "3 per second" for the Send button. `sent` mails over `elapsedMs`, measured from
 * what actually went out, so it is true whichever way the server paces the sends.
 * Returns null until there is enough to measure.
 */
export function sendRateLabel(sent, elapsedMs) {
  if (!(sent > 0) || !(elapsedMs >= 500)) return null
  const perSecond = sent / (elapsedMs / 1000)
  const shown = perSecond >= 10 ? Math.round(perSecond) : Math.round(perSecond * 10) / 10
  return `${shown} per second`
}
