'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Clients page has been consolidated into Reports. Redirect permanently. */
export default function AdminClientsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/reports') }, [router])
  return null
}
