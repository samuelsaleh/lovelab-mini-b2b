import { redirect } from 'next/navigation'

/** The request is a column on Stock now (10 Sept 2026). */
export default function CertificatesRequestPage() {
  redirect('/certificates/stock')
}
