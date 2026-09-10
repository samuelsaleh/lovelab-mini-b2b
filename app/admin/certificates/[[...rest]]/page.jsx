import { redirect } from 'next/navigation'

/**
 * The certificate module used to live here, as pages inside the admin panel.
 * It is now its own application at /certificates. Anything still pointing at
 * the old address — a bookmark, a link in an email — lands in the right place
 * instead of a 404.
 */
export default async function OldCertificatesRoute({ params }) {
  const { rest } = await params
  redirect(`/certificates${rest?.length ? `/${rest.join('/')}` : ''}`)
}
