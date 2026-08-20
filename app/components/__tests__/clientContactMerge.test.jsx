/**
 * mergeClientContact — the guard that stops a browser autofill (or a
 * half-filled order header) from silently replacing the contact details of a
 * client record every agent shares.
 */

import { mergeClientContact, CONTACT_FIELDS } from '@/lib/clientContactMerge'

const STORED = { name: 'Marie Dupont', email: 'contact@littlefactory.re', phone: '+262693218939' }

describe('mergeClientContact — new client', () => {
  it('takes every incoming value when there is no existing record', () => {
    const { fields, warnings } = mergeClientContact(null, {
      name: 'Marie Dupont',
      email: 'contact@littlefactory.re',
      phone: '+262693218939',
    })
    expect(fields).toEqual(STORED)
    expect(warnings).toEqual([])
  })

  it('writes null for missing values on a new client', () => {
    const { fields, warnings } = mergeClientContact(null, { name: 'Marie' })
    expect(fields).toEqual({ name: 'Marie', email: null, phone: null })
    expect(warnings).toEqual([])
  })
})

describe('mergeClientContact — empty incoming never wipes stored data', () => {
  it.each([
    ['empty strings', { name: '', email: '', phone: '' }],
    ['whitespace only', { name: '   ', email: '\t', phone: ' \n ' }],
    ['nulls', { name: null, email: null, phone: null }],
    ['undefined', { name: undefined, email: undefined, phone: undefined }],
    ['missing keys', {}],
  ])('%s leaves the stored contact untouched', (_label, incoming) => {
    const { fields, warnings } = mergeClientContact(STORED, incoming)
    expect(fields).toEqual({})
    expect(warnings).toEqual([])
  })

  it('ignores a completely absent incoming object', () => {
    const { fields, warnings } = mergeClientContact(STORED, null)
    expect(fields).toEqual({})
    expect(warnings).toEqual([])
  })
})

describe('mergeClientContact — unchanged values are a no-op', () => {
  it('treats identical values as unchanged', () => {
    const { fields, warnings } = mergeClientContact(STORED, { ...STORED })
    expect(fields).toEqual({})
    expect(warnings).toEqual([])
  })

  it('ignores differences in casing and surrounding whitespace', () => {
    const { fields, warnings } = mergeClientContact(STORED, {
      name: '  MARIE DUPONT ',
      email: 'CONTACT@LITTLEFACTORY.RE',
      phone: ' +262693218939',
    })
    expect(fields).toEqual({})
    expect(warnings).toEqual([])
  })
})

describe('mergeClientContact — filling a gap is always allowed', () => {
  it('writes a value when the stored column is empty', () => {
    const { fields, warnings } = mergeClientContact(
      { name: '', email: null, phone: '   ' },
      { name: 'Marie Dupont', email: 'contact@littlefactory.re', phone: '+262693218939' },
    )
    expect(fields).toEqual(STORED)
    expect(warnings).toEqual([])
  })
})

describe('mergeClientContact — a different value needs confirmation', () => {
  const AUTOFILLED = { name: 'Dionne Saleh', email: 'dionnesaleh@gmail.com', phone: '+32475000000' }

  it('keeps the stored contact and reports every conflict without confirmation', () => {
    const { fields, warnings } = mergeClientContact(STORED, AUTOFILLED)
    expect(fields).toEqual({})
    expect(warnings).toEqual([
      { field: 'name', stored: 'Marie Dupont', incoming: 'Dionne Saleh' },
      { field: 'email', stored: 'contact@littlefactory.re', incoming: 'dionnesaleh@gmail.com' },
      { field: 'phone', stored: '+262693218939', incoming: '+32475000000' },
    ])
  })

  it('replaces the stored contact once confirmed', () => {
    const { fields, warnings } = mergeClientContact(STORED, AUTOFILLED, { confirmOverwrite: true })
    expect(fields).toEqual(AUTOFILLED)
    expect(warnings).toEqual([])
  })

  it('only reports the field that actually differs', () => {
    const { fields, warnings } = mergeClientContact(STORED, { ...STORED, email: 'new@littlefactory.re' })
    expect(fields).toEqual({})
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toEqual({
      field: 'email',
      stored: 'contact@littlefactory.re',
      incoming: 'new@littlefactory.re',
    })
  })

  it('trims the value it writes after confirmation', () => {
    const { fields } = mergeClientContact(STORED, { name: '  Sophie Martin  ' }, { confirmOverwrite: true })
    expect(fields.name).toBe('Sophie Martin')
  })

  it('never touches a column outside the contact set', () => {
    const { fields } = mergeClientContact(
      STORED,
      { name: 'Sophie Martin', company: 'HACKED', vat: 'FR0', address: 'elsewhere' },
      { confirmOverwrite: true },
    )
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['name']))
    for (const key of Object.keys(fields)) {
      expect(CONTACT_FIELDS).toContain(key)
    }
  })
})
