'use client'

import AgentSelfView from '@/app/components/AgentSelfView'

export default function AgentContractsPage() {
  // The "Contracts" sidebar entry opens the Organisation tab where the
  // agent's contract upload + organisation info live (mirrors the admin
  // view's Organisation tab).
  return <AgentSelfView defaultTab="organisation" focused pageTitle="Contract & Organisation" />
}
