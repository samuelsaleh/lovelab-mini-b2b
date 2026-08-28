import { ADMIN_NAV_ITEMS, flattenNavItems } from '../navItems'

describe('the certificates group in the admin sidebar', () => {
  const group = ADMIN_NAV_ITEMS.find((i) => i.id === 'certificates-group')

  it('is there', () => {
    expect(group).toBeDefined()
    expect(group.label).toBe('Certificates')
  })

  it('holds the six screens, in the order the work actually happens', () => {
    expect(group.children.map((c) => c.href)).toEqual([
      '/admin/certificates',
      '/admin/certificates/requests',
      '/admin/certificates/visits',
      '/admin/certificates/stock',
      '/admin/certificates/models',
      '/admin/certificates/matching',
    ])
  })

  it('gives every leaf its own href', () => {
    expect(group.children.every((c) => c.href && c.id)).toBe(true)
  })

  it('leaves the rest of the admin nav alone', () => {
    const ids = ADMIN_NAV_ITEMS.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'out-memos', 'analytics', 'back']))
  })

  it('flattens into leaves the sidebar can route to', () => {
    const leaves = flattenNavItems(ADMIN_NAV_ITEMS).map((i) => i.id)
    expect(leaves).toEqual(expect.arrayContaining([
      'certificates', 'certificates-request', 'certificates-visits',
      'certificates-stock', 'certificates-models', 'certificates-matching',
    ]))
    expect(leaves).not.toContain('certificates-group')
  })
})

describe('every certificates nav id has a sidebar icon', () => {
  // An id with no entry in the ICONS map silently falls back to the home icon,
  // which makes three different screens look like the same one.
  it('is covered in Sidebar.jsx', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'components', 'Sidebar.jsx'),
      'utf8',
    )
    const group = ADMIN_NAV_ITEMS.find((i) => i.id === 'certificates-group')
    const ids = ['certificates-group', ...group.children.map((c) => c.id)]
    for (const id of ids) {
      expect(source).toContain(`'${id}':`)
    }
  })
})
