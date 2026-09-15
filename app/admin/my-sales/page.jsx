'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthProvider';
import AgentSelfView from '@/app/components/AgentSelfView';

/**
 * "My Sales" — an admin who is a commercial (is_agent, Sam, 15 Sep 2026) sees
 * their own orders, commissions and payments here, inside the admin portal.
 * Same view an agent gets on /agent, without leaving the admin sidebar: a
 * commercial is an employee, not an agent.
 */
export default function MySalesPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const isCommercial = Boolean(profile?.is_agent) && profile?.agent_status !== 'inactive';

  useEffect(() => {
    if (!loading && profile && !isCommercial) router.replace('/admin');
  }, [loading, profile, isCommercial, router]);

  if (loading || !isCommercial) return null;
  return <AgentSelfView defaultTab="financials" />;
}
