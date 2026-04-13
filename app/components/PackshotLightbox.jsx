'use client'

import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

export default function PackshotLightbox({ images, currentIndex, onClose, onNavigate }) {
  const hasNav = images && images.length > 1
  const src = images?.[currentIndex]?.url || images?.[currentIndex] || (typeof images === 'string' ? images : null)
  const label = images?.[currentIndex]?.color || null

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose()
    if (!hasNav) return
    if (e.key === 'ArrowLeft') onNavigate(Math.max(0, currentIndex - 1))
    if (e.key === 'ArrowRight') onNavigate(Math.min(images.length - 1, currentIndex + 1))
  }, [onClose, onNavigate, currentIndex, hasNav, images])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  if (!src) return null

  const content = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 20,
          background: 'none', border: 'none', color: '#fff',
          fontSize: 28, cursor: 'pointer', zIndex: 2,
        }}
        aria-label="Close"
      >
        ×
      </button>

      {hasNav && currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1) }}
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

      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <img
          src={typeof src === 'string' ? src : src.url}
          alt={label || 'Product packshot'}
          style={{
            maxWidth: '85vw', maxHeight: '80vh',
            objectFit: 'contain', borderRadius: 8,
          }}
        />
        {label && (
          <div style={{ color: '#fff', fontSize: 14, marginTop: 12, fontWeight: 600 }}>
            {label}
          </div>
        )}
        {hasNav && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {hasNav && currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1) }}
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
