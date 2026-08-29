import fs from 'node:fs'
import path from 'node:path'
import {
  FORBIDDEN_TO_IGI, toIgiModel, toIgiLine, toIgiVisit,
} from '../igi/portalShapes'

const PORTAL_DIR = path.join(__dirname, '..', '..', 'app', 'api', 'igi-portal')

function everyFileIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? everyFileIn(path.join(dir, e.name)) : [path.join(dir, e.name)]
  ))
}

describe('IGI never receives a shelf figure', () => {
  const MODEL = {
    id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1,
    shape: 'Round', spec: null, pool_min: 1800, sort_order: 3,
    // Fields that must not travel, present on the row IGI's own query can return.
    shelf_min: 25, qty_ordered: 12250,
  }

  it('sends a model with their stock and their level, and nothing of LoveLab\'s', () => {
    const out = toIgiModel(MODEL, { pool: 11020, askedNow: 50 })
    expect(out).toEqual({
      id: 'm1', serial: 'LGAJ6530', name: 'Cuty-Cubix', stones: '1', carat: 0.1,
      shape: 'Round', spec: null, pool: 11020, pool_min: 1800, asked_now: 50,
    })
    expect(out).not.toHaveProperty('shelf_min')
  })

  it('carries the carat and shape, so a serial never travels alone', () => {
    const out = toIgiModel(MODEL, { pool: 1, askedNow: 0 })
    expect(out.carat).toBe(0.1)
    expect(out.shape).toBe('Round')
  })

  it('sends a request line with what they hold and how short they are', () => {
    const line = { id: 'l1', model_id: 'm1', qty_requested: 500, qty_issued: null }
    const out = toIgiLine(line, MODEL, 41)
    expect(out).toMatchObject({ qty_requested: 500, held: 41, short_by: 459 })
    expect(out).not.toHaveProperty('shelf')
  })

  it('never reports a negative shortage', () => {
    const line = { id: 'l1', model_id: 'm1', qty_requested: 10, qty_issued: null }
    expect(toIgiLine(line, MODEL, 900).short_by).toBe(0)
  })

  it('keeps every forbidden field out of every shape', () => {
    // The one assertion that catches somebody widening a shared select later.
    const payloads = [
      toIgiModel(MODEL, { pool: 1, askedNow: 2 }),
      toIgiLine({ id: 'l', model_id: 'm1', qty_requested: 1, qty_issued: 1 }, MODEL, 1),
      toIgiVisit(
        { id: 'v', visit_no: 1, visit_date: '2026-08-28', status: 'requested', date_suspect: false, unattributed_total: null },
        [],
      ),
    ]
    const json = JSON.stringify(payloads).toLowerCase()
    for (const field of FORBIDDEN_TO_IGI) {
      expect(json).not.toContain(field)
    }
  })
})

describe('the IGI routes run as the user, never as the service role', () => {
  // Everywhere else in this codebase authorization is enforced in JavaScript
  // against the service-role client. That is fine for an internal boundary. This
  // one is between two companies, so row level security has to be the thing
  // standing in the way — which only works if these routes never hold the key
  // that bypasses it.
  const files = everyFileIn(PORTAL_DIR).filter((f) => f.endsWith('.js'))

  it('has routes to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })

  it.each(files.map((f) => [path.relative(PORTAL_DIR, f), f]))(
    '%s does not import the service-role client',
    (_name, file) => {
      const source = fs.readFileSync(file, 'utf8')
      // Comments explain the rule; an import would break it.
      const imports = source
        .split('\n')
        .filter((l) => /^\s*import\b/.test(l) || /require\(/.test(l))
        .join('\n')
      expect(imports).not.toContain('createAdminClient')
    },
  )

  it.each(files.filter((f) => f.endsWith('route.js')).map((f) => [path.relative(PORTAL_DIR, f), f]))(
    '%s authorises through requireIgi',
    (_name, file) => {
      expect(fs.readFileSync(file, 'utf8')).toContain('requireIgi')
    },
  )
})

describe('LoveLab’s preview of IGI’s side cannot show more than IGI can', () => {
  // The point of the preview is that Sam can answer "what does IGI actually
  // have on screen" without borrowing their password. It is only worth
  // anything if it is provably the same view, which is why it reuses their
  // loader and their shapers instead of running a similar query of its own.
  const file = path.join(process.cwd(), 'app', 'api', 'igi', 'their-side', 'route.js')
  const source = fs.readFileSync(file, 'utf8')

  it('assembles the view through IGI’s own loader', () => {
    expect(source).toContain('loadIgiWorld')
    expect(source).toContain("@/app/api/igi-portal/_lib/load")
  })

  it('builds every section with the same view builders as their portal', () => {
    // The shapers are one level down now: the views call them, and both sides
    // call the views. Asserting the indirection is the point — a hand-rolled
    // section here would be a copy that drifts.
    for (const view of ['todoView', 'stockView', 'historyView']) {
      expect(source).toContain(view)
    }
    expect(source).toContain('@/lib/igi/portalViews')
  })

  it('is LoveLab-only, so IGI cannot reach it', () => {
    expect(source).toContain('requireLoveLab')
    expect(source).not.toContain('requireIgi')
  })

  it('never selects a table of its own', () => {
    // A .from() here would be a second query that looks right today and drifts
    // from their portal by March. Everything must come through the loader.
    expect(source).not.toMatch(/\.from\(/)
  })
})

describe('a LoveLab admin driving IGI’s portal drives the portal, not a likeness', () => {
  const PREVIEW_DIR = path.join(process.cwd(), 'app', 'api', 'igi', 'preview')
  const read = (...p) => fs.readFileSync(path.join(PREVIEW_DIR, ...p), 'utf8')

  it.each(['todo', 'stock', 'history', 'invoices'])(
    '%s answers from the same builder IGI’s own route uses', (screen) => {
      const source = read(screen, 'route.js')
      expect(source).toContain('@/lib/igi/portalViews')
      // A query here is how "the same screen" quietly becomes "a similar
      // screen" a few months later.
      expect(source).not.toMatch(/\.from\(/)
    })

  it.each([
    ['batches', 'route.js'],
    ['alerts', 'route.js'],
    ['todo', '[visitId]', 'produce', 'route.js'],
  ])('%s writes through the same action IGI’s own route calls', (...p) => {
    const source = read(...p)
    expect(source).toContain('@/lib/igi/portalActions')
    expect(source).not.toMatch(/\.from\(/)
  })

  it('is LoveLab-only, everywhere under preview', () => {
    for (const file of everyFileIn(PREVIEW_DIR).filter((f) => f.endsWith('route.js'))) {
      const source = fs.readFileSync(file, 'utf8')
      expect(source).toContain('requireLoveLab')
      expect(source).not.toContain('requireIgi')
    }
  })

  it('stamps every write with whoever acted, never with IGI', () => {
    // This is what keeps "each company enters its own half" true once IGI are
    // live, while leaving their half testable before they have a login.
    const actions = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'igi', 'portalActions.js'), 'utf8')
    expect(actions).toContain('created_by: userId')
    expect(actions).toContain('issued_by: userId')
  })
})

describe('IGI’s own read routes go through the shared builders', () => {
  // If one of them stopped, Sam's preview of that screen would drift from what
  // IGI actually see, which is the one thing the preview must never do.
  it.each(['todo', 'stock', 'history', 'invoices'])('%s does', (screen) => {
    const source = fs.readFileSync(path.join(PORTAL_DIR, screen, 'route.js'), 'utf8')
    expect(source).toContain('@/lib/igi/portalViews')
    expect(source).not.toMatch(/\.from\(/)
  })
})
