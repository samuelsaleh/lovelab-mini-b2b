/**
 * @jest-environment node
 *
 * What the Photos list says about each card photo, in plain words.
 * A photo is "stuck" when it has been processing for more than 5 minutes.
 */
const { describeImage, summarizeImages, batchStatusLabel, STUCK_AFTER_MIN } = require('../fair-assistant/imageStatus')

const NOW = new Date('2026-10-13T10:00:00Z').getTime()
const ago = (min) => new Date(NOW - min * 60000).toISOString()

describe('describeImage', () => {
  test('processed photo = lead created', () => {
    expect(describeImage({ status: 'processed', created_at: ago(3) }, NOW)).toMatchObject({ key: 'done', tone: 'ok', label: '✓ done', stuck: false })
  })

  test('processed with a duplicate note = already in Salesforce, and says no lead is added here', () => {
    const d = describeImage({ status: 'processed', error: 'Duplicate — already in Salesforce (00Q123)', created_at: ago(30) }, NOW)
    expect(d).toMatchObject({ key: 'duplicate', tone: 'info', label: '✓ already in Salesforce' })
    expect(d.detail).toMatch(/no lead is added/i)
  })

  test('processing for less than the limit = reading the card', () => {
    const d = describeImage({ status: 'processing', created_at: ago(1) }, NOW)
    expect(d).toMatchObject({ key: 'processing', tone: 'warn', stuck: false })
    expect(d.detail).toMatch(/under 30 seconds/i)
  })

  test(`processing for more than ${STUCK_AFTER_MIN} minutes = stuck, with the age and what to do`, () => {
    const d = describeImage({ status: 'processing', created_at: ago(18) }, NOW)
    expect(d).toMatchObject({ key: 'stuck', tone: 'bad', stuck: true, ageMin: 18 })
    expect(d.label).toMatch(/18 min/)
    expect(d.detail).toMatch(/Salesforce/)
  })

  test('exactly at the limit is not stuck yet', () => {
    expect(describeImage({ status: 'processing', created_at: ago(STUCK_AFTER_MIN) }, NOW).stuck).toBe(false)
  })

  test('failed shows the stored reason', () => {
    expect(describeImage({ status: 'failed', error: 'Card processing failed in n8n', created_at: ago(2) }, NOW))
      .toMatchObject({ key: 'failed', tone: 'bad', label: '✗ failed', detail: 'Card processing failed in n8n' })
  })

  test('failed with no reason still says something useful', () => {
    expect(describeImage({ status: 'failed', created_at: ago(2) }, NOW).detail).toMatch(/delete the photo and upload it again/i)
  })

  test('missing created_at is treated as just created, never as stuck', () => {
    expect(describeImage({ status: 'processing' }, NOW).stuck).toBe(false)
  })

  test('unknown status falls back to muted with the raw value', () => {
    expect(describeImage({ status: 'pending', created_at: ago(1) }, NOW)).toMatchObject({ key: 'pending', tone: 'muted', label: 'pending' })
  })
})

describe('summarizeImages', () => {
  const imgs = [
    { status: 'processed', created_at: ago(40) },
    { status: 'processed', error: 'Duplicate — already in Salesforce', created_at: ago(40) },
    { status: 'processing', created_at: ago(1) },
    { status: 'processing', created_at: ago(18) },
    { status: 'processing', created_at: ago(9) },
    { status: 'failed', error: 'x', created_at: ago(40) },
  ]
  test('counts each state and reports the oldest stuck photo', () => {
    expect(summarizeImages(imgs, NOW)).toEqual({ total: 6, done: 1, duplicate: 1, processing: 1, stuck: 2, failed: 1, oldestStuckMin: 18 })
  })
  test('empty list', () => {
    expect(summarizeImages([], NOW)).toEqual({ total: 0, done: 0, duplicate: 0, processing: 0, stuck: 0, failed: 0, oldestStuckMin: 0 })
  })
})

describe('batchStatusLabel', () => {
  test.each([
    ['uploading', 'Uploading'], ['extracting', 'Reading cards'], ['extracted', 'Leads ready'], ['drafting', 'Drafts ready'],
    ['generating', 'Writing emails'], ['sending', 'Sending'], ['complete', 'Sent'], ['failed', 'Failed'], ['stuck', 'Stuck'],
  ])('%s -> %s', (status, label) => expect(batchStatusLabel(status)).toBe(label))
  test('unknown or missing status is passed through safely', () => {
    expect(batchStatusLabel('weird')).toBe('weird')
    expect(batchStatusLabel(undefined)).toBe('')
  })
})

describe('sendRateLabel', () => {
  const { sendRateLabel } = require('../fair-assistant/imageStatus')
  test('measured from what actually went out', () => {
    expect(sendRateLabel(30, 10000)).toBe('3 per second')
    expect(sendRateLabel(25, 10000)).toBe('2.5 per second')
    expect(sendRateLabel(100, 8000)).toBe('13 per second')
  })
  test('nothing to show before it can be measured', () => {
    expect(sendRateLabel(0, 5000)).toBeNull()
    expect(sendRateLabel(5, 100)).toBeNull()
    expect(sendRateLabel(undefined, undefined)).toBeNull()
  })
})
