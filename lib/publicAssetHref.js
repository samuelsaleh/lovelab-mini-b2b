/**
 * Encode each path segment of a public/ asset URL.
 * Folders like "Price Lists" and filenames with spaces / parentheses must be
 * encoded or browsers and the email attachment fetcher return 404.
 */
export function publicAssetHref(path) {
  return String(path || '')
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/');
}

/** Allowed static resource paths used by /api/resources/send-email. */
export const ALLOWED_RESOURCE_PATH_RE =
  /^\/(Price Lists|Ean Codes|catalogues|BRAND PRESENTATION DOCS)(\/[^/]+)+\.(xlsx|pdf)$/i;
