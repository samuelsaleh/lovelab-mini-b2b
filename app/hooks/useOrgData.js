'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useOrgData(orgId) {
  const [orgDetails, setOrgDetails] = useState(null);
  const [orgLedger, setOrgLedger] = useState(null);
  const [orgMembers, setOrgMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const abortRef = useRef(null);

  const reload = useCallback(async () => {
    if (!orgId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const [detailsRes, ledgerRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}`, { signal }),
        fetch(`/api/organizations/${orgId}/ledger?include_orders=true`, { signal }),
        fetch(`/api/organizations/${orgId}/members`, { signal }),
      ]);

      const [detailsJson, ledgerJson, membersJson] = await Promise.all([
        detailsRes.json().catch(() => ({})),
        ledgerRes.json().catch(() => ({})),
        membersRes.json().catch(() => ({})),
      ]);

      if (!detailsRes.ok) {
        throw new Error(detailsJson.error || 'Failed to load organization');
      }

      const partialWarnings = [];

      setOrgDetails(detailsJson.organization || detailsJson);

      if (!ledgerRes.ok) {
        partialWarnings.push(ledgerJson.error || 'Failed to load ledger');
        setOrgLedger(null);
      } else {
        setOrgLedger(ledgerJson);
      }

      if (!membersRes.ok) {
        partialWarnings.push(membersJson.error || 'Failed to load members');
        setOrgMembers([]);
      } else {
        setOrgMembers(membersJson.members || []);
      }

      if (partialWarnings.length > 0) {
        setWarnings(partialWarnings);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[useOrgData] Error:', err.message);
      setError(err.message);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId]);

  useEffect(() => {
    reload();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [reload]);

  return { orgDetails, orgLedger, orgMembers, loading, error, warnings, reload };
}
