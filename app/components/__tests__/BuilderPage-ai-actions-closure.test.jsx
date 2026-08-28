/**
 * BuilderPage — AI Advisor action plumbing for closureType + certType
 *
 * When the AI returns an ADD action like:
 *   { type: 'add', collection: 'CUTY', color: 'Black', carat: '0.10',
 *     certType: 'igi', closureType: 'braided', housing: 'Yellow',
 *     size: 'M', qty: 2 }
 *
 * the new builder line MUST carry both certType and closureType, otherwise
 * the row fails the OrderForm validation gate and the agent gets a "fix
 * these red rows" error with no obvious cause.
 *
 * Same story for MODIFY actions that flip closure from braided →
 * nonBraided (or change the cert type) on existing rows.
 */

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react'
import { renderWithI18n, mockColorConfig } from './testUtils'

// jsdom doesn't ship scrollIntoView. The chat panel's autoscroll effect
// crashes the test if we don't polyfill it.
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = function noop() {}
}

jest.mock('@/lib/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true, isCompact: false }),
}))

const sendBuilderChat = jest.fn()
jest.mock('@/lib/api', () => ({
  sendBuilderChat: (...args) => sendBuilderChat(...args),
}))

const BuilderPage = require('../BuilderPage').default
const { mkLine } = require('../BuilderPage')
const { COLLECTIONS } = require('@/lib/catalog')

const CUTY = COLLECTIONS.find(c => c.id === 'CUTY')

function makeCutyLine() {
  return {
    ...mkLine(),
    collectionId: CUTY.id,
    colorConfigs: [mockColorConfig({ caratIdx: 0, housing: 'Yellow', size: 'M' })],
    expanded: true,
  }
}

function StatefulHarness({ initialLines, onLines }) {
  const [lines, setLines] = React.useState(initialLines)
  React.useEffect(() => { onLines(lines) }, [lines, onLines])
  return (
    <BuilderPage
      lines={lines}
      setLines={setLines}
      onGenerateQuote={jest.fn()}
      budget=""
      setBudget={jest.fn()}
      budgetRecommendations={null}
      showRecommendations={false}
      setShowRecommendations={jest.fn()}
      onRequestRecommendations={jest.fn()}
    />
  )
}

async function runAddAction(harness, action) {
  sendBuilderChat.mockResolvedValueOnce({
    message: 'Adding row',
    actions: [action],
  })

  const { container } = harness

  // Open the chat panel — the toggle is "Build with Claude".
  const chatToggle = container.querySelector('[data-testid="build-with-claude"]')
    || Array.from(container.querySelectorAll('button')).find(b =>
      /Build with Claude/i.test(b.textContent || '')
    )
  expect(chatToggle).toBeTruthy()
  await act(async () => { fireEvent.click(chatToggle) })

  // Type and send
  const input = container.querySelector('input[type="text"]')
  expect(input).toBeTruthy()
  await act(async () => {
    fireEvent.change(input, { target: { value: 'add CUTY braided' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Allow the mocked promise to resolve and React to flush
    await new Promise(r => setTimeout(r, 0))
  })

  // Click "Apply Changes" — button text falls back to that English label
  const applyBtn = Array.from(container.querySelectorAll('button')).find(b =>
    (b.textContent || '').toLowerCase().includes('apply')
  )
  expect(applyBtn).toBeTruthy()
  await act(async () => { fireEvent.click(applyBtn) })
}

describe('BuilderPage — Build with Claude', () => {
  it('is on the collection grid so Claude is not a separate sidebar page', () => {
    renderWithI18n(
      <BuilderPage
        lines={[mkLine()]}
        setLines={jest.fn()}
        onGenerateQuote={jest.fn()}
        budget=""
        setBudget={jest.fn()}
        budgetRecommendations={null}
        showRecommendations={false}
        setShowRecommendations={jest.fn()}
        onRequestRecommendations={jest.fn()}
      />,
    )
    const toggle = document.querySelector('[data-testid="build-with-claude"]')
    expect(toggle).toBeTruthy()
    expect(toggle.textContent).toMatch(/Build with Claude/)
  })
})

describe('BuilderPage — AI ADD action plumbs closureType + certType into the line', () => {
  beforeEach(() => sendBuilderChat.mockReset())

  test('ADD with closureType: "braided" + certType: "igi" lands on the new color config', async () => {
    let captured = null
    const harness = renderWithI18n(
      <StatefulHarness
        initialLines={[makeCutyLine()]}
        onLines={(l) => { captured = l }}
      />
    )

    await runAddAction(harness, {
      type: 'add',
      collection: 'CUTY',
      color: 'Black',
      carat: '0.10',
      certType: 'igi',
      closureType: 'braided',
      housing: 'Yellow',
      size: 'M',
      qty: 2,
    })

    const cutyLine = captured.find(l => l.collectionId === CUTY.id)
    expect(cutyLine).toBeTruthy()
    // The brand-new config is the last one in the line.
    const cfg = cutyLine.colorConfigs[cutyLine.colorConfigs.length - 1]
    expect(cfg.colorName).toBe('Black')
    expect(cfg.closureType).toBe('braided')
    expect(cfg.certType).toBe('igi')
    expect(cfg.housing).toBe('Yellow')
    expect(cfg.size).toBe('M')
    expect(cfg.qty).toBe(2)
  })

  test('ADD with bogus closureType is sanitised to null (defends against hallucinations)', async () => {
    let captured = null
    const harness = renderWithI18n(
      <StatefulHarness
        initialLines={[makeCutyLine()]}
        onLines={(l) => { captured = l }}
      />
    )

    await runAddAction(harness, {
      type: 'add',
      collection: 'CUTY',
      color: 'Black',
      carat: '0.10',
      closureType: 'twisted-rope-fancy', // not a real value
      housing: 'Yellow',
      size: 'M',
      qty: 1,
    })

    const cutyLine = captured.find(l => l.collectionId === CUTY.id)
    const cfg = cutyLine.colorConfigs[cutyLine.colorConfigs.length - 1]
    expect(cfg.closureType).toBeNull()
  })

  test('ADD on a non-closure collection (SSPF — silk) leaves closureType null even if the AI sends one', async () => {
    let captured = null
    const harness = renderWithI18n(
      <StatefulHarness
        initialLines={[makeCutyLine()]}
        onLines={(l) => { captured = l }}
      />
    )

    await runAddAction(harness, {
      type: 'add',
      collection: 'SHAPY SPARKLE FANCY',
      color: 'Red',
      carat: '0.70',
      shape: 'Round',
      closureType: 'braided', // SSPF is silk — has no closure, should be ignored
      qty: 1,
    })

    const sspfLine = captured.find(l => {
      const col = COLLECTIONS.find(c => c.id === l.collectionId)
      return col && col.label === 'SHAPY SPARKLE FANCY'
    })
    expect(sspfLine).toBeTruthy()
    const cfg = sspfLine.colorConfigs[sspfLine.colorConfigs.length - 1]
    expect(cfg.closureType).toBeNull()
  })

  // Shapy Shine is braided-only (Alberto, Aug 2026). The advisor prompt says so,
  // but a hallucinated "nonBraided" must not reach the line either.
  test('ADD on SHAPY SHINE FANCY is forced to braided even when the AI says nonBraided', async () => {
    let captured = null
    const harness = renderWithI18n(
      <StatefulHarness
        initialLines={[makeCutyLine()]}
        onLines={(l) => { captured = l }}
      />
    )

    await runAddAction(harness, {
      type: 'add',
      collection: 'SHAPY SHINE FANCY',
      color: 'Black',
      carat: '0.30',
      shape: 'Pear',
      housing: 'Prong Yellow',
      size: 'M',
      closureType: 'nonBraided',
      qty: 1,
    })

    const ssfLine = captured.find(l => l.collectionId === 'SSF')
    expect(ssfLine).toBeTruthy()
    const cfg = ssfLine.colorConfigs[ssfLine.colorConfigs.length - 1]
    expect(cfg.closureType).toBe('braided')
  })

  test('ADD on SHAPY SHINE FANCY gets braided even when the AI omits the closure', async () => {
    let captured = null
    const harness = renderWithI18n(
      <StatefulHarness
        initialLines={[makeCutyLine()]}
        onLines={(l) => { captured = l }}
      />
    )

    await runAddAction(harness, {
      type: 'add',
      collection: 'SHAPY SHINE FANCY',
      color: 'Black',
      carat: '0.30',
      shape: 'Pear',
      housing: 'Bezel Yellow',
      size: 'M',
      qty: 1,
    })

    const ssfLine = captured.find(l => l.collectionId === 'SSF')
    const cfg = ssfLine.colorConfigs[ssfLine.colorConfigs.length - 1]
    expect(cfg.closureType).toBe('braided')
  })
})
