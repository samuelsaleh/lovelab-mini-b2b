'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, fonts } from '@/lib/styles'
import { publicAssetHref } from '@/lib/publicAssetHref'
import { slidePaths, INTERVAL_OPTIONS, DEFAULT_INTERVAL_SECONDS } from '@/lib/slideshows'

/**
 * SlideshowPlayer — an unattended, full-bleed deck player for the fair booth.
 *
 * Every frame is mounted at once and cross-faded with opacity, so after the
 * first pass through the deck there is no decode flicker between slides — the
 * thing runs for hours on a booth screen without anyone touching it.
 *
 * Behaviour that matters on a stand:
 *   • auto-advances every `intervalSeconds`, loops forever
 *   • a screen wake lock (where supported) keeps the display from sleeping
 *   • controls fade out after 3s of stillness, so the deck reads as signage
 *   • ← → step, space pauses, F toggles the browser's real fullscreen, Esc exits
 */
export default function SlideshowPlayer({
  show,
  onExit,
  initialIntervalSeconds = DEFAULT_INTERVAL_SECONDS,
  autoFullscreen = false,
}) {
  const slides = slidePaths(show)
  const total = slides.length

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(initialIntervalSeconds)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const rootRef = useRef(null)
  const hideTimer = useRef(null)
  const wakeLock = useRef(null)

  // ── Navigation ──────────────────────────────────────────────────────────
  const goTo = useCallback((next) => {
    if (total === 0) return
    setIndex(((next % total) + total) % total)
  }, [total])

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  // ── Auto-advance ────────────────────────────────────────────────────────
  useEffect(() => {
    if (paused || total < 2) return undefined
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % total)
    }, Math.max(1, intervalSeconds) * 1000)
    return () => clearTimeout(id)
  }, [index, paused, intervalSeconds, total])

  // ── Fullscreen ──────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    if (req) {
      try { req.call(el) } catch { /* user gesture missing — ignore */ }
    }
  }, [])

  const exitFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    const ex = document.exitFullscreen || document.webkitExitFullscreen
    if (ex && (document.fullscreenElement || document.webkitFullscreenElement)) {
      try { ex.call(document) } catch { /* ignore */ }
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement || document.webkitFullscreenElement) exitFullscreen()
    else enterFullscreen()
  }, [enterFullscreen, exitFullscreen])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // Deep-linked booth mode (?fullscreen=1) — browsers may still require a
  // gesture, in which case this is a no-op and the F button remains.
  useEffect(() => {
    if (autoFullscreen) enterFullscreen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keep the booth screen awake ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const acquire = async () => {
      if (typeof navigator === 'undefined' || !navigator.wakeLock) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release?.(); return }
        wakeLock.current = lock
      } catch { /* denied or unsupported — the deck still runs */ }
    }

    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      try { wakeLock.current?.release?.() } catch { /* ignore */ }
      wakeLock.current = null
    }
  }, [])

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev() }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen() }
      else if (e.key === 'Escape') {
        // The browser eats Esc to leave fullscreen; this only fires when windowed.
        if (!(document.fullscreenElement || document.webkitFullscreenElement)) onExit?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, toggleFullscreen, onExit])

  // ── Auto-hiding controls ────────────────────────────────────────────────
  const wakeControls = useCallback(() => {
    setControlsVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  useEffect(() => {
    wakeControls()
    return () => clearTimeout(hideTimer.current)
  }, [wakeControls])

  // ── Render ──────────────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <div style={{ ...shellStyle, color: '#fff', fontFamily: fonts.body, fontSize: 14 }}>
        This presentation has no slides yet.
      </div>
    )
  }

  const btn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 36, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
    fontFamily: fonts.body, fontSize: 13, fontWeight: 600,
    color: '#fff', background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.22)',
    backdropFilter: 'blur(6px)',
  }

  return (
    <div
      ref={rootRef}
      data-testid="slideshow-player"
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
      style={{ ...shellStyle, cursor: controlsVisible ? 'default' : 'none' }}
    >
      {/* Stage — every frame mounted, cross-faded */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {slides.map((src, i) => (
          <img
            key={src}
            src={publicAssetHref(src)}
            alt={`${show.title} — slide ${i + 1} of ${total}`}
            aria-hidden={i !== index}
            // The first three frames load eagerly so the deck starts instantly;
            // the rest stream in behind the opening slide.
            loading={i < 3 ? 'eager' : 'lazy'}
            decoding="async"
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'contain',
              opacity: i === index ? 1 : 0,
              transition: 'opacity 700ms ease-in-out',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      {/* Click zones — tap left/right thirds to step, centre to pause */}
      <button aria-label="Previous slide (tap left of the screen)" onClick={prev}
        style={{ ...zoneStyle, left: 0, width: '28%' }} />
      <button aria-label="Pause or resume (tap the middle of the screen)" onClick={() => { setPaused((p) => !p); wakeControls() }}
        style={{ ...zoneStyle, left: '28%', width: '44%' }} />
      <button aria-label="Next slide (tap right of the screen)" onClick={next}
        style={{ ...zoneStyle, right: 0, width: '28%' }} />

      {/* Progress bar — one continuous sweep per slide */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.14)' }}>
        <div
          key={`${index}-${intervalSeconds}-${paused}`}
          style={{
            height: '100%',
            background: `linear-gradient(90deg, ${colors.gradientDeep}, ${colors.gradientPink})`,
            width: paused ? '100%' : 0,
            animation: paused ? 'none' : `lovelabSlideProgress ${intervalSeconds}s linear forwards`,
            opacity: paused ? 0.35 : 1,
          }}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '48px 20px 18px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0))',
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity .35s',
          pointerEvents: controlsVisible ? 'auto' : 'none',
        }}
      >
        <button style={btn} onClick={onExit} aria-label="Close slideshow">✕ Close</button>
        <button style={btn} onClick={prev} data-testid="slideshow-prev" aria-label="Previous slide">‹</button>
        <button style={btn} onClick={() => setPaused((p) => !p)} data-testid="slideshow-playpause">
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        <button style={btn} onClick={next} data-testid="slideshow-next" aria-label="Next slide">›</button>

        <label style={{ ...btn, cursor: 'default', gap: 8 }}>
          <span style={{ opacity: 0.75 }}>Every</span>
          <select
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            aria-label="Seconds per slide"
            style={{
              background: 'transparent', color: '#fff', border: 'none',
              fontFamily: fonts.body, fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none',
            }}
          >
            {INTERVAL_OPTIONS.map((s) => (
              <option key={s} value={s} style={{ color: '#111' }}>{s}s</option>
            ))}
          </select>
        </label>

        <button style={btn} onClick={toggleFullscreen} data-testid="slideshow-fullscreen">
          {isFullscreen ? '⤡ Exit fullscreen' : '⛶ Fullscreen'}
        </button>

        <span style={{
          marginLeft: 'auto', color: 'rgba(255,255,255,0.85)',
          fontFamily: fonts.body, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
        }}>
          {show.title} · {index + 1} / {total}
        </span>
      </div>

      <style>{`
        @keyframes lovelabSlideProgress { from { width: 0 } to { width: 100% } }
      `}</style>
    </div>
  )
}

const shellStyle = {
  position: 'fixed', inset: 0, zIndex: 9000,
  background: '#000',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'hidden',
}

const zoneStyle = {
  position: 'absolute', top: 0, bottom: 64,
  background: 'transparent', border: 'none', padding: 0,
  cursor: 'pointer', appearance: 'none',
}
