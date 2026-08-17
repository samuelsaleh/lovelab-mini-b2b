'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Minimum horizontal finger travel (px) to count as a swipe. Below this the
// gesture is treated as a tap (which closes the lightbox via the backdrop).
const SWIPE_THRESHOLD = 50

export default function PackshotLightbox({ images, currentIndex, onClose, onNavigate }) {
  const hasNav = images && images.length > 1
  const src = images?.[currentIndex]?.url || images?.[currentIndex] || (typeof images === 'string' ? images : null)
  const label = images?.[currentIndex]?.color || null

  // Touch state — swipe left/right to navigate, double-tap to zoom.
  const touchStart = useRef(null)
  const lastTap = useRef(0)
  const [zoomed, setZoomed] = useState(false)

  // Mouse state — desktop users try to "swipe" by dragging with the cursor
  // or trackpad, which never produces touch events. Track mouse drags via
  // pointer events (touch keeps using the dedicated touch handlers below).
  const mouseStart = useRef(null)
  const suppressClick = useRef(false)

  const goPrev = useCallback(() => {
    if (hasNav && currentIndex > 0) onNavigate(currentIndex - 1)
  }, [hasNav, currentIndex, onNavigate])

  const goNext = useCallback(() => {
    if (hasNav && currentIndex < images.length - 1) onNavigate(currentIndex + 1)
  }, [hasNav, currentIndex, images, onNavigate])

  // Reset zoom whenever the image changes
  useEffect(() => { setZoomed(false) }, [currentIndex])

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose()
    if (!hasNav) return
    if (e.key === 'ArrowLeft') goPrev()
    if (e.key === 'ArrowRight') goNext()
  }, [onClose, hasNav, goPrev, goNext])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  // Preload neighbours so a swipe shows the next image instantly.
  useEffect(() => {
    if (!hasNav || typeof window === 'undefined') return
    const preload = (idx) => {
      const item = images[idx]
      const url = typeof item === 'string' ? item : item?.url
      if (url) {
        const img = new window.Image()
        img.src = url
      }
    }
    if (currentIndex > 0) preload(currentIndex - 1)
    if (currentIndex < images.length - 1) preload(currentIndex + 1)
  }, [currentIndex, hasNav, images])

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) { touchStart.current = null; return }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = (e) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || e.changedTouches.length !== 1) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y

    // Horizontal swipe wins only when clearly horizontal — otherwise scrolling
    // a zoomed image vertically would accidentally change photos.
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (zoomed) return
      if (dx < 0) goNext()
      else goPrev()
      return
    }

    // Double-tap to zoom (two taps within 300ms, minimal movement)
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        setZoomed(z => !z)
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  const handlePointerDown = (e) => {
    if (e.pointerType !== 'mouse') return
    mouseStart.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (e) => {
    if (e.pointerType !== 'mouse') return
    const start = mouseStart.current
    mouseStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return

    // Any real drag must not fall through to the backdrop's onClick — the
    // browser still fires a click after mouseup even when the mouse moved.
    suppressClick.current = true
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) && !zoomed) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  const handleBackdropClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onClose()
  }

  if (!src) return null

  const content = (
    <div
      onClick={handleBackdropClick}
      data-testid="lightbox-backdrop"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // 'none' stops Safari's own gestures from eating the swipe; when
        // zoomed we hand control back so the image can be panned natively.
        touchAction: zoomed ? 'auto' : 'none',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 16,
          background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
          fontSize: 24, cursor: 'pointer', zIndex: 2,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Close"
      >
        ×
      </button>

      {hasNav && currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            fontSize: 24, width: 44, height: 44, borderRadius: '50%',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: 'center',
          overflow: zoomed ? 'auto' : 'visible',
          maxWidth: '100vw', maxHeight: '100vh',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <img
          src={typeof src === 'string' ? src : src.url}
          alt={label || 'Product packshot'}
          data-testid="lightbox-image"
          draggable={false}
          style={{
            maxWidth: zoomed ? 'none' : '85vw',
            maxHeight: zoomed ? 'none' : '80vh',
            width: zoomed ? '170vw' : 'auto',
            objectFit: 'contain', borderRadius: zoomed ? 0 : 8,
            transition: 'border-radius .15s',
            cursor: hasNav && !zoomed ? 'grab' : undefined,
            userSelect: 'none', WebkitUserSelect: 'none',
          }}
        />
        {!zoomed && label && (
          <div style={{ color: '#fff', fontSize: 14, marginTop: 12, fontWeight: 600 }}>
            {label}
          </div>
        )}
        {!zoomed && hasNav && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {hasNav && currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            fontSize: 24, width: 44, height: 44, borderRadius: '50%',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
