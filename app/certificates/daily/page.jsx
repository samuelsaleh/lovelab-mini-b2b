import CertificatesVisitsClient from '@/app/components/CertificatesVisitsClient'

/** The day-by-day view is the Movements screen with its switch on "By day". */
export default function DailyPage() {
  return <CertificatesVisitsClient initialView="day" />
}
