'use client'

export default function PackshotThumb({ src, size = 40, onClick }) {
  if (!src) return null
  return (
    <img
      src={src}
      width={size}
      height={size}
      loading="lazy"
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
