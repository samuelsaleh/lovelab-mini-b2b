/**
 * The one pill on the fair Leads list answering "did the email reach them?".
 * Sam, 9 Sept 2026: after a send, the desktop table only said "extracted"
 * (the card-scan status) and nothing about the email.
 */
import { emailStatusFor } from '../FairAssistantClient'

describe('emailStatusFor', () => {
  test('nothing written yet → no pill', () => {
    expect(emailStatusFor(null)).toBeNull()
    expect(emailStatusFor({ status: 'pending' })).toBeNull()
  })

  test('sent but no delivery answer yet says so, delivered is green', () => {
    expect(emailStatusFor({ status: 'sent' })).toMatchObject({ label: '✓ sent, awaiting delivery', bad: false })
    expect(emailStatusFor({ status: 'sent', delivery_status: 'delivered' })).toMatchObject({ label: '✓ delivered', bad: false })
  })

  test('a bounce outranks "sent" and carries the reason', () => {
    const pill = emailStatusFor({ status: 'sent', delivery_status: 'bounced', delivery_error: 'The address does not exist. Check the spelling with the client and send again.' })
    expect(pill).toMatchObject({ label: '✗ bounced', bad: true })
    expect(pill.detail).toMatch(/does not exist/)
    expect(emailStatusFor({ status: 'sent', delivery_status: 'complained' }).label).toBe('✗ marked as spam')
    expect(emailStatusFor({ status: 'sent', delivery_status: 'delivery_delayed' })).toMatchObject({ label: '⏳ delivery delayed', bad: false })
  })

  test('a refused translation or failed send is red with its reason', () => {
    const pill = emailStatusFor({ status: 'failed', error: 'Translation to Dutch was refused: paragraph1 was left in English' })
    expect(pill).toMatchObject({ label: '✗ not sent', bad: true })
    expect(pill.detail).toMatch(/refused/)
    expect(emailStatusFor({ status: 'draft_ready' })).toMatchObject({ label: '○ draft ready', bad: false })
  })
})
