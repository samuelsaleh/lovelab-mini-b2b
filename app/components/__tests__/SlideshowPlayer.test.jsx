/**
 * SlideshowPlayer tests — the behaviour a fair booth depends on.
 *
 * The player runs unattended for hours, so the guarantees worth pinning are:
 * it advances on its own at the configured interval, it loops rather than
 * ending, pause actually stops the clock, and the fullscreen control asks the
 * browser for real fullscreen.
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import SlideshowPlayer from '../SlideshowPlayer'

const SHOW = { id: 'demo', title: 'Demo Deck', dir: '/slideshows/demo', count: 3 }

const visibleSlide = () =>
  screen.getAllByRole('img', { hidden: true }).findIndex(
    (img) => img.style.opacity === '1'
  )

beforeEach(() => {
  jest.useFakeTimers()
  // jsdom implements neither of these.
  Element.prototype.requestFullscreen = jest.fn()
  document.exitFullscreen = jest.fn()
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

const advance = (ms) => act(() => { jest.advanceTimersByTime(ms) })

describe('SlideshowPlayer', () => {
  test('mounts every frame so later slides never flicker in', () => {
    render(<SlideshowPlayer show={SHOW} />)
    expect(screen.getAllByRole('img', { hidden: true })).toHaveLength(3)
    expect(visibleSlide()).toBe(0)
  })

  test('advances on its own at the configured interval', () => {
    render(<SlideshowPlayer show={SHOW} initialIntervalSeconds={10} />)
    expect(visibleSlide()).toBe(0)

    advance(9000)
    expect(visibleSlide()).toBe(0)

    advance(1000)
    expect(visibleSlide()).toBe(1)

    advance(10000)
    expect(visibleSlide()).toBe(2)
  })

  test('loops back to the first slide instead of stopping at the end', () => {
    render(<SlideshowPlayer show={SHOW} initialIntervalSeconds={10} />)
    advance(10000)
    advance(10000)
    advance(10000)
    expect(visibleSlide()).toBe(0)
  })

  test('pause stops the clock, play restarts it', () => {
    render(<SlideshowPlayer show={SHOW} initialIntervalSeconds={10} />)

    fireEvent.click(screen.getByTestId('slideshow-playpause'))
    advance(60000)
    expect(visibleSlide()).toBe(0)

    fireEvent.click(screen.getByTestId('slideshow-playpause'))
    advance(10000)
    expect(visibleSlide()).toBe(1)
  })

  test('the arrow controls step through the deck and wrap around', () => {
    render(<SlideshowPlayer show={SHOW} initialIntervalSeconds={10} />)

    fireEvent.click(screen.getByTestId('slideshow-next'))
    expect(visibleSlide()).toBe(1)

    fireEvent.click(screen.getByTestId('slideshow-prev'))
    fireEvent.click(screen.getByTestId('slideshow-prev'))
    expect(visibleSlide()).toBe(2)
  })

  test('the fullscreen button asks the browser for real fullscreen', () => {
    render(<SlideshowPlayer show={SHOW} />)
    fireEvent.click(screen.getByTestId('slideshow-fullscreen'))
    expect(Element.prototype.requestFullscreen).toHaveBeenCalled()
  })

  test('changing seconds-per-slide re-paces the deck immediately', () => {
    render(<SlideshowPlayer show={SHOW} initialIntervalSeconds={10} />)

    fireEvent.change(screen.getByLabelText('Seconds per slide'), { target: { value: '5' } })
    advance(5000)
    expect(visibleSlide()).toBe(1)
  })

  test('Escape closes the player when it is not in browser fullscreen', () => {
    const onExit = jest.fn()
    render(<SlideshowPlayer show={SHOW} onExit={onExit} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onExit).toHaveBeenCalled()
  })

  test('an empty deck says so rather than rendering a black void', () => {
    render(<SlideshowPlayer show={{ id: 'x', title: 'X', dir: '/slideshows/x', count: 0 }} />)
    expect(screen.getByText(/no slides yet/i)).toBeInTheDocument()
  })
})
