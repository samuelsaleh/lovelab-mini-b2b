'use client'

import AgentSelfView from '@/app/components/AgentSelfView'

// Phase 22 (2026-05-13) — Reports tab is now part of Financials. The
// /agent/reports sidebar route still exists but mounts the merged
// Financials body in focused mode (still titled "Reports" so the agent
// recognises where she clicked from). Past reports + Commission History
// + Payments all render together — same data, one screen.
export default function AgentReportsPage() {
  return <AgentSelfView defaultTab="financials" focused pageTitle="Reports" />
}
