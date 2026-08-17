/**
 * PackshotLightbox — touch gesture regression tests (July 2026).
 *
 * On iPhone the lightbox previously only navigated via keyboard arrows and
 * the two small ‹ › buttons — swiping did nothing. Guarantees:
 *   - swipe left  → next image
 *   - swipe right → previous image
 *   - swipes are clamped at both ends (no out-of-range navigation)
 *   - a mostly-vertical drag does NOT navigate
 *   - double-tap toggles zoom
 *   - keyboard navigation still works
 */

import { render, screen, fireEvent } from '@testing-library/react'
import PackshotLightbox from '../PackshotLightbox'

// jsdom has no PointerEvent — without this polyfill, fireEvent.pointerDown
// silently drops pointerType and clientX/clientY.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? ''
      this.pointerId = init.pointerId ?? 1
    }
  }
}

const IMAGES = [
  { url: 'https://example.com/1.png', color: 'Bordeaux' },
  { url: 'https://example.com/2.png', color: 'Black' },
  { url: 'https://example.com/3.png', color: 'White' },
]

function swipe(el, { fromX, toX, fromY = 200, toY = 200 }) {
  fireEvent.touchStart(el, { touches: [{ clientX: fromX, clientY: fromY }] })
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: toX, clientY: toY }] })
}

describe('PackshotLightbox touch gestures', () => {
  let onClose, onNavigate

  beforeEach(() => {
    onClose = jest.fn()
    onNavigate = jest.fn()
  })

  function renderLightbox(currentIndex = 1) {
    return render(
      <PackshotLightbox
        images={IMAGES}
        currentIndex={currentIndex}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    )
  }

  test('swipe left navigates to the next image', () => {
    renderLightbox(1)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 300, toX: 100 })
    expect(onNavigate).toHaveBeenCalledWith(2)
  })

  test('swipe right navigates to the previous image', () => {
    renderLightbox(1)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 100, toX: 300 })
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  test('swipe left on the last image does nothing', () => {
    renderLightbox(2)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 300, toX: 100 })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  test('swipe right on the first image does nothing', () => {
    renderLightbox(0)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 100, toX: 300 })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  test('a short drag below the threshold does not navigate', () => {
    renderLightbox(1)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 200, toX: 170 })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  test('a mostly-vertical drag does not navigate', () => {
    renderLightbox(1)
    swipe(screen.getByTestId('lightbox-backdrop'), { fromX: 300, toX: 200, fromY: 100, toY: 400 })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  test('double-tap toggles zoom on the image', () => {
    renderLightbox(1)
    const backdrop = screen.getByTestId('lightbox-backdrop')
    const img = screen.getByTestId('lightbox-image')
    expect(img.style.maxWidth).toBe('85vw')

    // Two quick taps in place
    swipe(backdrop, { fromX: 200, toX: 200 })
    swipe(backdrop, { fromX: 200, toX: 200 })
    expect(screen.getByTestId('lightbox-image').style.maxWidth).toBe('none')

    // Double-tap again to zoom back out
    swipe(backdrop, { fromX: 200, toX: 200 })
    swipe(backdrop, { fromX: 200, toX: 200 })
    expect(screen.getByTestId('lightbox-image').style.maxWidth).toBe('85vw')
  })

  test('keyboard arrows still navigate', () => {
    renderLightbox(1)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith(2)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  test('Escape closes the lightbox', () => {
    renderLightbox(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

/**
 * Desktop mouse/trackpad drags (Aug 2026): dragging with the cursor produced
 * no touch events, so "swiping" on a laptop did nothing. Drags are now
 * handled through pointer events, and a drag must never close the lightbox
 * via the backdrop click that browsers fire after mouseup.
 */
describe('PackshotLightbox mouse drag gestures', () => {
  let onClose, onNavigate

  beforeEach(() => {
    onClose = jest.fn()
    onNavigate = jest.fn()
  })

  function renderLightbox(currentIndex = 1) {
    return render(
      <PackshotLightbox
        images={IMAGES}
        currentIndex={currentIndex}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    )
  }

  function mouseDrag(el, { fromX, toX, fromY = 200, toY = 200, click = true }) {
    fireEvent.pointerDown(el, { pointerType: 'mouse', clientX: fromX, clientY: fromY })
    fireEvent.pointerUp(el, { pointerType: 'mouse', clientX: toX, clientY: toY })
    // Browsers fire a click on the common ancestor after mouseup, even when
    // the mouse moved between down and up.
    if (click) fireEvent.click(el)
  }

  test('mouse drag left navigates to the next image', () => {
    renderLightbox(1)
    mouseDrag(screen.getByTestId('lightbox-backdrop'), { fromX: 300, toX: 100 })
    expect(onNavigate).toHaveBeenCalledWith(2)
  })

  test('mouse drag right navigates to the previous image', () => {
    renderLightbox(1)
    mouseDrag(screen.getByTestId('lightbox-backdrop'), { fromX: 100, toX: 300 })
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  test('a mouse drag does not close the lightbox', () => {
    renderLightbox(1)
    mouseDrag(screen.getByTestId('lightbox-backdrop'), { fromX: 300, toX: 100 })
    expect(onClose).not.toHaveBeenCalled()
  })

  test('a short vertical mouse drag neither navigates nor closes', () => {
    renderLightbox(1)
    mouseDrag(screen.getByTestId('lightbox-backdrop'), { fromX: 200, toX: 205, fromY: 100, toY: 250 })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('a plain click on the backdrop still closes the lightbox', () => {
    renderLightbox(1)
    mouseDrag(screen.getByTestId('lightbox-backdrop'), { fromX: 200, toX: 202, fromY: 200, toY: 201 })
    expect(onClose).toHaveBeenCalled()
  })

  test('a drag followed by a plain click closes (suppression resets)', () => {
    renderLightbox(1)
    const backdrop = screen.getByTestId('lightbox-backdrop')
    mouseDrag(backdrop, { fromX: 300, toX: 100 })
    expect(onClose).not.toHaveBeenCalled()
    mouseDrag(backdrop, { fromX: 200, toX: 200 })
    expect(onClose).toHaveBeenCalled()
  })

  test('touch swipes do not double-trigger via pointer events', () => {
    renderLightbox(1)
    const backdrop = screen.getByTestId('lightbox-backdrop')
    // A real touch swipe fires pointer events (pointerType 'touch') AND touch
    // events — only the touch path may navigate.
    fireEvent.pointerDown(backdrop, { pointerType: 'touch', clientX: 300, clientY: 200 })
    fireEvent.touchStart(backdrop, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.pointerUp(backdrop, { pointerType: 'touch', clientX: 100, clientY: 200 })
    fireEvent.touchEnd(backdrop, { changedTouches: [{ clientX: 100, clientY: 200 }] })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith(2)
  })
})
