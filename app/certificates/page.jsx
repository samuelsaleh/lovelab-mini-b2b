import { redirect } from 'next/navigation'

/**
 * The certificate application opens on Stock (Sam, 16 Sept 2026: "too much
 * information"). There is no dashboard any more — the one line under the
 * Stock title says what a dashboard used to take a screen to say.
 */
export default function CertificatesPage() {
  redirect('/certificates/stock')
}
