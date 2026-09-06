'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'
import { publicAssetHref } from '@/lib/publicAssetHref'
import {
  SLIDESHOWS,
  findSlideshow,
  slidePaths,
  DEFAULT_INTERVAL_SECONDS,
} from '@/lib/slideshows'
import SlideshowPlayer from '../components/SlideshowPlayer'

/**
 * /slideshow — the fair booth screen.
 *
 * Sits behind the app's AuthGuard like every other page. Bookmarkable in
 * booth form: /slideshow?deck=lifestyle&interval=10&fullscreen=1 opens a deck
 * straight into the player, so the stand machine only needs one shortcut.
 */
function SlideshowPageInner() {
  const router = useRouter()
  const params = useSearchParams()

  const deckParam = params.get('deck')
  const intervalParam = Number(params.get('interval'))
  const wantsFullscreen = params.get('fullscreen') === '1'

  const [activeId, setActiveId] = useState(null)
  const [autoFullscreen, setAutoFullscreen] = useState(false)

  const intervalSeconds =
    Number.isFinite(intervalParam) && intervalParam > 0 ? intervalParam : DEFAULT_INTERVAL_SECONDS

  // Deep link → open that deck immediately.
  useEffect(() => {
    if (deckParam && findSlideshow(deckParam)) {
      setActiveId(deckParam)
      setAutoFullscreen(wantsFullscreen)
    }
  }, [deckParam, wantsFullscreen])

  const active = findSlideshow(activeId)

  if (active) {
    return (
      <SlideshowPlayer
        show={active}
        initialIntervalSeconds={intervalSeconds}
        autoFullscreen={autoFullscreen}
        onExit={() => { setActiveId(null); setAutoFullscreen(false) }}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.lovelabBg, padding: '48px 24px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'none', border: 'none', padding: 0, marginBottom: 20,
            color: colors.lovelabMuted, fontFamily: fonts.body, fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          ‹ Back to app
        </button>

        <h1 style={{
          fontSize: 30, fontWeight: 800, color: colors.inkPlum,
          margin: '0 0 6px', letterSpacing: '-0.02em', fontFamily: fonts.body,
        }}>
          Fair Slideshow
        </h1>
        <p style={{ margin: '0 0 32px', color: colors.lovelabMuted, fontFamily: fonts.body, fontSize: 14 }}>
          Pick a presentation, then hit Fullscreen. It advances on its own every{' '}
          {DEFAULT_INTERVAL_SECONDS} seconds and loops — leave it running on the booth screen all day.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 18,
        }}>
          {SLIDESHOWS.map((show) => {
            const cover = slidePaths(show)[0]
            return (
              <div
                key={show.id}
                data-testid={`slideshow-card-${show.id}`}
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  border: `1px solid ${colors.lineGray}`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <button
                  onClick={() => setActiveId(show.id)}
                  aria-label={`Play ${show.title}`}
                  style={{
                    display: 'block', width: '100%', padding: 0, border: 'none',
                    background: '#f2eef5', cursor: 'pointer', aspectRatio: '16 / 9',
                    overflow: 'hidden',
                  }}
                >
                  {cover && (
                    <img
                      src={publicAssetHref(cover)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: show.landscape ? 'cover' : 'contain' }}
                    />
                  )}
                </button>

                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum, fontFamily: fonts.body }}>
                    {show.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: colors.lovelabMuted, fontFamily: fonts.body }}>
                    {show.subtitle}
                  </div>
                  <div style={{ fontSize: 11.5, color: colors.textMuted, fontFamily: fonts.body, marginTop: 2 }}>
                    {show.count} slides
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => setActiveId(show.id)}
                      style={{
                        flex: 1, padding: '9px 12px', borderRadius: 9, border: 'none',
                        background: colors.inkPlum, color: '#fff', fontSize: 13,
                        fontWeight: 700, cursor: 'pointer', fontFamily: fonts.body,
                      }}
                    >
                      ▶ Play
                    </button>
                    {show.source && (
                      <a
                        href={publicAssetHref(show.source)}
                        download
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '9px 12px', borderRadius: 9,
                          border: `1px solid ${colors.inkPlum}`, color: colors.inkPlum,
                          fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: fonts.body,
                        }}
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p style={{
          marginTop: 32, color: colors.textMuted, fontFamily: fonts.body,
          fontSize: 12.5, lineHeight: 1.7,
        }}>
          In the player: <strong>space</strong> pauses · <strong>← →</strong> steps ·{' '}
          <strong>F</strong> toggles fullscreen · <strong>Esc</strong> closes. The seconds-per-slide
          dropdown changes the pace live. For an unattended booth machine, bookmark{' '}
          <code style={{ background: '#efe9f3', padding: '1px 5px', borderRadius: 4 }}>
            /slideshow?deck=lifestyle&amp;interval=10&amp;fullscreen=1
          </code>.
        </p>
      </div>
    </div>
  )
}

export default function SlideshowPage() {
  return (
    <Suspense fallback={null}>
      <SlideshowPageInner />
    </Suspense>
  )
}
