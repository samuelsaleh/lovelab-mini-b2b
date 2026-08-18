import { commissionDisplayDate } from '../commissionDate'

describe('commissionDisplayDate', () => {
  test('document-linked orders use the original order date', () => {
    expect(commissionDisplayDate({
      type: 'order',
      created_at: '2026-08-18T13:27:53.000Z',
      document: { created_at: '2026-02-21T11:40:53.000Z' },
    })).toBe('2026-02-21T11:40:53.000Z')
  })

  test('manual orders without a document keep their ledger date', () => {
    expect(commissionDisplayDate({
      type: 'order',
      created_at: '2026-01-15T10:00:00.000Z',
      document: null,
    })).toBe('2026-01-15T10:00:00.000Z')
  })

  test.each(['bonus', 'new_client_bonus'])(
    '%s keeps its own date even when linked to a document',
    (type) => {
      expect(commissionDisplayDate({
        type,
        created_at: '2026-08-18T13:27:53.000Z',
        document: { created_at: '2026-02-21T11:40:53.000Z' },
      })).toBe('2026-08-18T13:27:53.000Z')
    },
  )

  test('missing dates render as empty', () => {
    expect(commissionDisplayDate({ type: 'order' })).toBeNull()
    expect(commissionDisplayDate(null)).toBeNull()
  })
})
