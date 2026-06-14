'use client'

// Next.js image-optimizer widths (images.imageSizes defaults). We snap the
// requested width up to one of these so /_next/image returns a cached variant.
const ALLOWED_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384]

// The raw packshot source files are full-resolution (1–5 MB each). Rendering
// them directly forces html2canvas to download AND decode every image during
// PDF capture — for a multi-page order that's hundreds of MB, which stalls
// Safari (~15s per page) and was the root cause of orders never saving.
// Routing each thumbnail through Next's image optimizer shrinks it to ~1 KB
// while keeping the photo, so capture is instant on every browser.
export function optimizedPackshotSrc(src, displaySize = 40) {
  if (!src || typeof src !== 'string') return src
  // Leave data URLs, already-optimized URLs and external/absolute URLs alone.
  if (
    src.startsWith('data:') ||
    src.startsWith('/_next/image') ||
    /^https?:\/\//.test(src)
  ) {
    return src
  }
  // 2× the display size for retina crispness, then snap to an allowed width.
  const target = Math.min(384, Math.max(64, Math.round(displaySize * 2)))
  const w = ALLOWED_WIDTHS.find((x) => x >= target) || 128
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`
}

export default function PackshotThumb({ src, size = 40, onClick }) {
  if (!src) return null
  return (
    <img
      src={optimizedPackshotSrc(src, size)}
      width={size}
      height={size}
      onClick={onClick}
      alt=""
      style={{
        objectFit: 'contain',
        borderRadius: 4,
        cursor: onClick ? 'pointer' : 'default',
        background: '#faf8fc',
      }}
    />
  )
}
