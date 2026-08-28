import { ADMIN_NAV_ITEMS, IGI_NAV_ITEMS, flattenNavItems, resolveIgiActiveId } from '../navItems'

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

describe('the IGI sidebar is exactly five items', () => {
  // Not a preference. IGI have one job, and the moment a sixth item appears the
  // tool that did one thing starts doing several badly.
  it('has five, and only five', () => {
    expect(IGI_NAV_ITEMS).toHaveLength(5)
  })

  it('names them in the order the work happens', () => {
    expect(IGI_NAV_ITEMS.map((i) => i.label)).toEqual([
      'To do', 'My stock', 'Add a batch', 'History', 'Invoices',
    ])
  })

  it('gives every item its own page and none any children', () => {
    for (const item of IGI_NAV_ITEMS) {
      expect(item.href).toMatch(/^\/igi/)
      expect(item.children).toBeUndefined()
    }
  })

  it('offers no way back into the LoveLab app', () => {
    // IGI are another company. There is nowhere for them to go back to.
    expect(IGI_NAV_ITEMS.some((i) => i.id === 'back' || i.isBack)).toBe(false)
    expect(IGI_NAV_ITEMS.some((i) => i.href === '/')).toBe(false)
  })

  it('highlights the right item for every path', () => {
    expect(resolveIgiActiveId('/igi')).toBe('igi-todo')
    expect(resolveIgiActiveId('/igi/stock')).toBe('igi-stock')
    expect(resolveIgiActiveId('/igi/batch')).toBe('igi-batch')
    expect(resolveIgiActiveId('/igi/history')).toBe('igi-history')
    expect(resolveIgiActiveId('/igi/invoices')).toBe('igi-invoices')
    expect(resolveIgiActiveId('/igi/anything-else')).toBe('igi-todo')
  })

  it('gives every item its own icon', () => {
    // An unmapped id silently falls back to the home icon, which would make all
    // five screens look like the same one.
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'components', 'Sidebar.jsx'),
      'utf8',
    )
    for (const item of IGI_NAV_ITEMS) {
      expect(source).toContain(`'${item.id}':`)
    }
  })
})
