'use client'

import { useRouter } from 'next/navigation'
import { fonts } from '@/lib/styles'
import TopNav from '../components/TopNav'
import AnalyticsDashboard from '../components/AnalyticsDashboard'

export default function AnalyticsPage() {
  const router = useRouter()

  const handleTabChange = (tab) => {
    if (tab === 'analytics') return
    sessionStorage.setItem('lovelab-target-tab', tab)
    router.push('/')
  }

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav
        activeTab="analytics"
        onTabChange={handleTabChange}
        hideClientBar
      />
      <AnalyticsDashboard />
    </div>
  )
}
