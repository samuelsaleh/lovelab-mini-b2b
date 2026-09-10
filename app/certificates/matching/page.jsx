import { redirect } from 'next/navigation'

/** Matching sits under Models now (10 Sept 2026). */
export default function CertificatesMatchingPage() {
  redirect('/certificates/models')
}
