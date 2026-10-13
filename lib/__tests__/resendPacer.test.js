/**
 * @jest-environment node
 *
 * The pacing queue behind every Resend send: one send STARTS every 1/N
 * second, shared by whoever asks. Resend allows 10 requests/second per team;
 * the fair send ran 8 in parallel and got 429s (9 Sept 2026).
 */
const { createPacer } = require('../resendPacer')

function fakeClock() {
  const clock = { t: 0, sleeps: [] }
  clock.now = () => clock.t
  clock.sleep = async (ms) => { clock.sleeps.push(ms) }   // records the wait, does not advance time
  return clock
}

describe('createPacer', () => {
  it('spaces concurrent sends 1/perSecond apart, each reserving its own slot', async () => {
    const c = fakeClock()
    const pacer = createPacer({ perSecond: 3, now: c.now, sleep: c.sleep })
    await Promise.all(Array.from({ length: 6 }, () => pacer.wait()))
    // First goes straight away, the others wait for slots 333, 667, 1000, 1333, 1667 ms.
    expect(c.sleeps).toHaveLength(5)
    c.sleeps.forEach((ms, i) => expect(ms).toBeCloseTo((i + 1) * (1000 / 3), 3))
  })

  it('never lets more than 3 sends start in any one second at 3 per second', async () => {
    const c = fakeClock()
    const pacer = createPacer({ perSecond: 3, now: c.now, sleep: c.sleep })
    await Promise.all(Array.from({ length: 30 }, () => pacer.wait()))
    const starts = [0, ...c.sleeps].sort((a, b) => a - b)
    for (const s of starts) {
      const inWindow = starts.filter((x) => x >= s && x < s + 999).length
      expect(inWindow).toBeLessThanOrEqual(3)
    }
    expect(starts[starts.length - 1]).toBeCloseTo(29 * (1000 / 3), 3)   // 30 mails take about 10 s
  })

  it('does not wait when sends arrive slower than the rate', async () => {
    const c = fakeClock()
    const pacer = createPacer({ perSecond: 3, now: c.now, sleep: c.sleep })
    await pacer.wait(); c.t = 5000
    await pacer.wait(); c.t = 9000
    await pacer.wait()
    expect(c.sleeps).toEqual([])
  })

  it('pushBack makes everyone wait after Resend said "slow down"', async () => {
    const c = fakeClock()
    const pacer = createPacer({ perSecond: 3, now: c.now, sleep: c.sleep })
    await pacer.wait()
    pacer.pushBack(4000)
    await pacer.wait()
    expect(c.sleeps).toEqual([4000])
  })

  it('perSecond Infinity or 0 means unlimited (tests, local dev)', async () => {
    const c = fakeClock()
    for (const perSecond of [Infinity, 0]) {
      const pacer = createPacer({ perSecond, now: c.now, sleep: c.sleep })
      await Promise.all(Array.from({ length: 10 }, () => pacer.wait()))
    }
    expect(c.sleeps).toEqual([])
  })
})
