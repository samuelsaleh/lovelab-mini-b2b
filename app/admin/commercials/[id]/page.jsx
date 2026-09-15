'use client';

import AgentDetail from '../../agents/[id]/AgentDetail';

// A commercial's page for the admin: orders, commissions, payments, reports —
// the same follow-up as an agent's, under its own heading (Sam, 15 Sep 2026).
export default function AdminCommercialDetailsPage() {
  return <AgentDetail kind="commercial" />;
}
