'use client'

import { useRouter } from 'next/navigation'
import InternalOrdersPanel from '@/app/components/InternalOrdersPanel'

export default function AdminInternalOrdersPage() {
  const router = useRouter()
  return (
    <InternalOrdersPanel
      onReEdit={(doc) => {
        if (doc?.id) router.push(`/?reEdit=${doc.id}`)
      }}
    />
  )
}
