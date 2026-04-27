import {
  RESOURCE_EMAIL_OVERRIDE_LIMITS,
  validateResourceEmailOverrides,
} from '@/lib/resources-email-overrides'

describe('validateResourceEmailOverrides', () => {
  test('accepts fields at the configured limits without truncating', () => {
    const body = {
      subject: 's'.repeat(RESOURCE_EMAIL_OVERRIDE_LIMITS.subject),
      greeting: 'g'.repeat(RESOURCE_EMAIL_OVERRIDE_LIMITS.greeting),
      body: 'b'.repeat(RESOURCE_EMAIL_OVERRIDE_LIMITS.body),
      signoff: 'x'.repeat(RESOURCE_EMAIL_OVERRIDE_LIMITS.signoff),
    }

    const result = validateResourceEmailOverrides(body)

    expect(result.ok).toBe(true)
    expect(result.overrides).toEqual(body)
  })

  test('rejects over-limit fields instead of silently slicing them', () => {
    const tooLong = 'b'.repeat(RESOURCE_EMAIL_OVERRIDE_LIMITS.body + 1)

    const result = validateResourceEmailOverrides({ body: tooLong })

    expect(result.ok).toBe(false)
    expect(result.field).toBe('body')
    expect(result.limit).toBe(RESOURCE_EMAIL_OVERRIDE_LIMITS.body)
    expect(result.length).toBe(tooLong.length)
    expect(result.error).toContain('body is too long')
  })
})
