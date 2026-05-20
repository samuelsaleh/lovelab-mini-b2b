import { findPackshot } from '@/lib/packshot-lookup';

function absUrl(siteUrl, path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = (siteUrl || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Fixed 2×2 product grid for fair outreach emails.
 * Images from packshot manifest; links to lovelab.be collections.
 */
export function getFairEmailProducts(siteUrl) {
  const cuty = findPackshot('CUTY', { color: 'Bordeaux' });
  const triply = findPackshot('M3', { color: 'Gold', subgroup: 'Detached', housing: 'MIX' });
  const matchy = findPackshot('MF', { shape: 'Pear', color: 'Navy Blue', subgroup: 'Bezel' });
  const cubix = findPackshot('CUBIX', { color: 'Green' });

  return [
    {
      label: 'CUTY',
      imageUrl: absUrl(siteUrl, cuty),
      href: 'https://lovelab.be/collections/cuty/010',
    },
    {
      label: 'TRIPLY',
      imageUrl: absUrl(siteUrl, triply),
      href: 'https://lovelab.be/collections/multi/three/mix',
    },
    {
      label: 'MATCHY',
      imageUrl: absUrl(siteUrl, matchy),
      href: 'https://lovelab.be/collections/matchy/pear',
    },
    {
      label: 'CUBIX',
      imageUrl: absUrl(siteUrl, cubix),
      href: 'https://lovelab.be/collections/cube/product',
    },
  ];
}
