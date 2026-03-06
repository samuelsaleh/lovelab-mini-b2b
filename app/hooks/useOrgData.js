'use client';

import { useState, useEffect, useCallback } from 'react';

export function useOrgData(orgId) {
  const [orgDetails, setOrgDetails] = useState(null);
  const [orgLedger, setOrgLedger] = useState(null);
  const [orgMembers, setOrgMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailsRes, ledgerRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}`),
        fetch(`/api/organizations/${orgId}/ledger?include_orders=true`),
        fetch(`/api/organizations/${orgId}/members`),
      ]);

      const [detailsJson, ledgerJson, membersJson] = await Promise.all([
        detailsRes.json().catch(() => ({})),
        ledgerRes.json().catch(() => ({})),
        membersRes.json().catch(() => ({})),
      ]);

      if (!detailsRes.ok) throw new Error(detailsJson.error || 'Failed to load organization');

      setOrgDetails(detailsJson.organization || detailsJson);
      setOrgLedger(ledgerJson);
      setOrgMembers(membersJson.members || []);
    } catch (err) {
      console.error('[useOrgData] Error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { orgDetails, orgLedger, orgMembers, loading, error, reload };
}
