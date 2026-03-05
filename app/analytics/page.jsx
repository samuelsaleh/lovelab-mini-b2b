'use client'

import { useRouter } from 'next/navigation'
import { fonts } from '@/lib/styles'
import TopNav from '../components/TopNav'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import AgentAnalytics from '../components/AgentAnalytics'
import { useAuth } from '../components/AuthProvider'

export default function AnalyticsPage() {
  const router = useRouter()
  const { profile, user } = useAuth()

  const handleTabChange = (tab) => {
    if (tab === 'analytics') return
    sessionStorage.setItem('lovelab-target-tab', tab)
    router.push('/')
  }

  const isAdmin = profile?.role === 'admin'
  const isAgent = profile?.is_agent

  return (
    <div style={{ fontFamily: fonts.body, background: '#f8f8f8', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav
        activeTab="analytics"
        onTabChange={handleTabChange}
        hideClientBar
      />
      {isAgent && !isAdmin ? <AgentAnalytics /> : <AnalyticsDashboard />}
    </div>
  )
}
