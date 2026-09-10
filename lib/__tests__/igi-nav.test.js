import { ADMIN_NAV_ITEMS, CERTIFICATE_NAV, CERTIFICATE_REDIRECTS, IGI_NAV_ITEMS, flattenNavItems, resolveIgiActiveId } from '../navItems'

describe('the way into the certificate application', () => {
  const door = ADMIN_NAV_ITEMS.find((i) => i.id === 'certificates')

  it('is a single item in the admin sidebar, not a group', () => {
    expect(door).toBeDefined()
    expect(door.label).toBe('Certificates')
    expect(door.href).toBe('/certificates')
    expect(door.children).toBeUndefined()
  })

  it('leaves the rest of the admin nav alone', () => {
    const ids = ADMIN_NAV_ITEMS.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'out-memos', 'analytics', 'back']))
  })

  it('survives flattening as a leaf the sidebar can route to', () => {
    const leaves = flattenNavItems(ADMIN_NAV_ITEMS).map((i) => i.id)
    expect(leaves).toContain('certificates')
    expect(leaves).not.toContain('certificates-group')
  })

  it('has a sidebar icon of its own', () => {
    // An id with no entry in the ICONS map silently falls back to the home
    // icon, which makes two different screens look like the same one.
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'components', 'Sidebar.jsx'),
      'utf8',
    )
    expect(source).toContain("'certificates':")
  })
})

describe("the certificate application's own nav", () => {
  // Sam, 10 Sept 2026: "why is it so complex?" Nine screens became five. The
  // request is a column on Stock, the day view is a switch on Movements,
  // matching sits under Models, and IGI's side is a link, not a screen.
  it('holds five screens, in the order the work actually happens', () => {
    expect(CERTIFICATE_NAV.map((n) => n.href)).toEqual([
      '/certificates',
      '/certificates/stock',
      '/certificates/visits',
      '/certificates/models',
      '/certificates/invoices',
    ])
    expect(CERTIFICATE_NAV.map((n) => n.label)).toEqual(['Dashboard', 'Stock', 'Movements', 'Models', 'Invoices'])
  })

  it('has no group headings any more — five things need no grouping', () => {
    expect(CERTIFICATE_NAV.some((n) => n.g)).toBe(false)
  })

  it('keeps the old addresses working', () => {
    expect(CERTIFICATE_REDIRECTS).toEqual({
      '/certificates/requests': '/certificates/stock',
      '/certificates/matching': '/certificates/models',
    })
    const fs = require('fs')
    const path = require('path')
    const page = (p) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'certificates', p, 'page.jsx'), 'utf8')
    expect(page('requests')).toContain("redirect('/certificates/stock')")
    expect(page('matching')).toContain("redirect('/certificates/models')")
    expect(page('daily')).toContain('initialView="day"')
  })

  it('links to IGI’s side from the shell, not the nav', () => {
    const fs = require('fs')
    const path = require('path')
    const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'certificates', 'layout.jsx'), 'utf8')
    expect(layout).toContain("aside={{ href: '/certificates/igi-view'")
    expect(CERTIFICATE_NAV.some((n) => n.href === '/certificates/igi-view')).toBe(false)
  })

  it('gives every link an id and a label', () => {
    for (const item of CERTIFICATE_NAV.filter((n) => n.href)) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
    }
  })

  it('never sends anyone back to the old admin address', () => {
    expect(CERTIFICATE_NAV.some((n) => n.href?.startsWith('/admin'))).toBe(false)
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
