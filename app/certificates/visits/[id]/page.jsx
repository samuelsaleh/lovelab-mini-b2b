import CertificatesVisitDetail from '@/app/components/CertificatesVisitDetail'

export default async function CertificatesVisitPage({ params }) {
  const { id } = await params
  return <CertificatesVisitDetail visitId={id} />
}
