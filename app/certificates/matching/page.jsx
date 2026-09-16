import CertificatesMatchingClient from '@/app/components/CertificatesMatchingClient'

/**
 * Which stock description belongs to which model. A one-time clean-up rather
 * than daily work, so it is a link at the foot of Models, not a section of it
 * (Sam, 16 Sept 2026).
 */
export default function CertificatesMatchingPage() {
  return <CertificatesMatchingClient />
}
