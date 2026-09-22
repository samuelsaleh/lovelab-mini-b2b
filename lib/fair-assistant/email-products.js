function absUrl(siteUrl, path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = (siteUrl || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Fixed 2×2 product grid for fair outreach emails.
 *
 * These point at public/email-packshots/, NOT at the catalogue packshots. The
 * originals are 4096×4096 PNGs of 1–5.6 MB each — about 9.5 MB of images per
 * email for four 200×200 tiles. Recipients on a phone at a fair either waited
 * for it or had the images blocked outright. The email copies are 600px, ~10 KB
 * each, cropped identically to the catalogue shots.
 *
 * To change a product or a colourway: edit SOURCES in
 * scripts/build-email-packshots.mjs, run it, and update the entry here.
 *
 * The hrefs are the collection pages on lovelab-antwerp.com (Sam, 22 Sep
 * 2026: the site moved from lovelab.be; deep product URLs redirect to the
 * collection page, so link there directly).
 * Do not "verify" them by fetching: the site answers 200 for every path, so a
 * wrong URL looks healthy and lands the recipient on an empty page.
 */
export function getFairEmailProducts(siteUrl) {
  return [
    {
      label: 'CUTY',
      imageUrl: absUrl(siteUrl, '/email-packshots/cuty.jpg'),
      href: 'https://lovelab-antwerp.com/collections/cuty',
    },
    {
      label: 'TRIPLY',
      imageUrl: absUrl(siteUrl, '/email-packshots/triply.jpg'),
      href: 'https://lovelab-antwerp.com/collections/multi',
    },
    {
      label: 'RIVIERA EIGHT',
      imageUrl: absUrl(siteUrl, '/email-packshots/riviera-eight.jpg'),
      href: 'https://lovelab-antwerp.com/collections/iconix',
    },
    {
      label: 'MATCHY',
      imageUrl: absUrl(siteUrl, '/email-packshots/matchy.jpg'),
      href: 'https://lovelab-antwerp.com/collections/matchy',
    },
  ];
}
