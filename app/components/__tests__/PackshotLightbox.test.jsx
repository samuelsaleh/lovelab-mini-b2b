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
