/**
 * Fair slideshows — the decks the Slideshow player can run.
 *
 * Each deck is a folder of pre-rendered JPEG frames under
 * /public/slideshows/<id>/slide-NN.jpg. Frames are generated from the source
 * PDF with `node scripts/build-slideshow-frames.mjs` (needs poppler's
 * pdftoppm). Pre-rendering — rather than rendering PDFs in the browser — is
 * what keeps the fair screen instant and offline-proof: the images are plain
 * static assets served by the CDN.
 *
 * `count` is the number of frames on disk. Keep it in sync with the folder;
 * the build script prints the value to paste here.
 */

export const SLIDESHOWS = [
  {
    id: 'lifestyle',
    title: 'LoveLab Lifestyle',
    subtitle: 'Worn moments — cords, colours, light',
    dir: '/slideshows/lifestyle',
    count: 26,
    // 16:9 — fills a fair screen edge to edge.
    landscape: true,
    source: '/BRAND PRESENTATION DOCS/LoveLab_Lifestyle_Slideshow.pdf',
  },
  {
    id: 'brand-en',
    title: 'Brand Presentation — English',
    subtitle: 'The house, the story, the collections',
    dir: '/slideshows/brand-en',
    count: 11,
    landscape: false,
    source: '/BRAND PRESENTATION DOCS/LoveLab_Brand_Presentation_General_EN.pdf',
  },
  {
    id: 'brand-fr',
    title: 'Présentation de Marque — Français',
    subtitle: 'La maison, l’histoire, les collections',
    dir: '/slideshows/brand-fr',
    count: 11,
    landscape: false,
    source: '/BRAND PRESENTATION DOCS/LoveLab_Presentation_Marque_FR.pdf',
  },
]

/** Frame URLs for a deck, in order. */
export function slidePaths(show) {
  if (!show || !show.count) return []
  return Array.from(
    { length: show.count },
    (_, i) => `${show.dir}/slide-${String(i + 1).padStart(2, '0')}.jpg`
  )
}

export function findSlideshow(id) {
  return SLIDESHOWS.find((s) => s.id === id) || null
}

/** Seconds-per-slide options offered in the player. 10s is the fair default. */
export const INTERVAL_OPTIONS = [5, 8, 10, 15, 20, 30]
export const DEFAULT_INTERVAL_SECONDS = 10
