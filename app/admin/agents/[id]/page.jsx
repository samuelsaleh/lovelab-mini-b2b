'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { colors, fonts } from '@/lib/styles';
import { useResponsive } from '@/lib/useIsMobile';
import { fmt } from '@/lib/utils';
import { parseAmount } from '@/lib/parseAmount';
import {
  applyCustomerPaidLocally,
  selectableForBulk,
  sendBulkCustomerPaid,
} from '@/lib/bulkCustomerPaid';
import { eligibleManualBonusRowIds } from '@/lib/newClientBonusEligibility';
import { resolveBonusMode } from '@/lib/newClientBonus';
import { resolveEffectiveRate } from '@/lib/effectiveRate';
import { commissionDisplayDate } from '@/lib/commissionDate';
import ContractChatPanel from '@/app/components/ContractChatPanel';
import AgentFolderBrowser from '@/app/components/AgentFolderBrowser';
import KpiCard from '@/app/components/KpiCard';
import AddBonusModal from '@/app/components/AddBonusModal';
import AddQuickOrderModal from '@/app/components/AddQuickOrderModal';
import NewClientBonusModal from '@/app/components/NewClientBonusModal';
import CommissionReportsCard from '@/app/components/CommissionReportsCard';
import SynaliaAgentTab from '@/app/components/SynaliaAgentTab';
import {
  isSynaliaAgentEmail,
  isSynaliaJewelerGroup,
  jewelerGroupFromLegacy,
  normalizeJewelerGroup,
} from '@/lib/jewelerGroup';

// Money formatter that ALWAYS shows the cents (e.g. "1 469,55 €", "1 469,00 €").
// The shared `fmt` hides ".00" on whole numbers; here mom wants to see the
// comma/cents on every commission and payment amount.
const fmt2 = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return '0,00 €';
  return new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function AdminAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = params?.id;
  const { isCompact } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agent, setAgent] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [docDerivedRows, setDocDerivedRows] = useState([]);
  // Commission History status filter ('all' | awaiting | ready | reported | paid | cancelled)
  const [commissionFilter, setCommissionFilter] = useState('all');
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingPayment, setSavingPayment] = useState(false);
  // Phase 29: Record Payment can settle a commission report + stamp an invoice.
  const [reports, setReports] = useState([]);
  const [paymentReportId, setPaymentReportId] = useState('');
  const [paymentInvoice, setPaymentInvoice] = useState('');
  // When non-null, the Record Payment modal is in edit mode for this row.
  const [editingPayment, setEditingPayment] = useState(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [showQuickOrderModal, setShowQuickOrderModal] = useState(false);
  const [showNewClientBonusModal, setShowNewClientBonusModal] = useState(false);

  // Contract Q&A panel
  const [contractChatOpen, setContractChatOpen] = useState(false);

  // Commission extraction
  const [extracting, setExtracting] = useState(false);
  const [proposedConfig, setProposedConfig] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);

  // Organization documents (orders/quotes linked via events)
  const [orgDocuments, setOrgDocuments] = useState([]);
  const [organizationFolderDocuments, setOrganizationFolderDocuments] = useState([]);
  // Consignment orders assigned to this agent
  const [agentConsignmentOrders, setAgentConsignmentOrders] = useState([]);

  // Organization context (editing/settlement now lives on the org page).
  const [orgData, setOrgData] = useState(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const [agentsRes, commRes, payRes, reportsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch(`/api/commissions?agent_id=${encodeURIComponent(agentId)}`),
        fetch(`/api/agent-payments?agent_id=${encodeURIComponent(agentId)}`),
        fetch(`/api/commission-reports?agent_id=${encodeURIComponent(agentId)}&limit=24`)
      ]);
      const agentsJson = await agentsRes.json().catch(() => ({}));
      const commJson = await commRes.json().catch(() => ({}));
      const payJson = await payRes.json().catch(() => ({}));
      const reportsJson = await reportsRes.json().catch(() => ({}));

      if (!agentsRes.ok) throw new Error(agentsJson?.error || 'Failed to load agent');
      if (!commRes.ok) throw new Error(commJson?.error || 'Failed to load commissions');

      const found = (agentsJson.agents || []).find((a) => a.id === agentId);
      if (!found) throw new Error('Agent not found');

      setAgent(found);
      const loadedCommissions = commJson.commissions || [];
      setCommissions(loadedCommissions);
      setInvoiceDrafts(Object.fromEntries(
        loadedCommissions.map((row) => [row.id, row.invoice_number || ''])
      ));
      setSummary(commJson.summary || null);
      setPayments(payJson.payments || []);
      setReports(reportsRes.ok ? (reportsJson.reports || []) : []);

      let loadedOrganization = null;
      if (found.organization_id) {
        const [membersRes, orgRes] = await Promise.all([
          fetch(`/api/organizations/${found.organization_id}/members`),
          fetch(`/api/organizations/${found.organization_id}`),
        ]);
        const membersJson = await membersRes.json().catch(() => ({}));
        const orgJson = await orgRes.json().catch(() => ({}));
        setOrganizationMembers(membersJson?.members || []);
        if (orgRes.ok && orgJson.organization) {
          loadedOrganization = orgJson.organization;
          setOrgData(orgJson.organization);
        }
      } else {
        setOrganizationMembers([]);
        setOrgData(null);
      }

      // Fetch docs + consignment orders in parallel (reuse docs for derived rows — no double fetch)
      let fetchedOrgDocs = [];
      let fetchedConsignmentOrders = [];
      try {
        const [orgDocsRes, consRes, teamDocsRes] = await Promise.all([
          fetch(`/api/documents?created_by_agent=${encodeURIComponent(agentId)}&per_page=200`),
          fetch(`/api/documents?order_channel=consignment&per_page=200`),
          found.organization_id
            ? fetch(`/api/documents?organization_id=${encodeURIComponent(found.organization_id)}&per_page=200`)
            : Promise.resolve(null),
        ]);
        const orgDocsJson = await orgDocsRes.json().catch(() => ({}));
        const consJson2 = await consRes.json().catch(() => ({}));
        const teamDocsJson = teamDocsRes ? await teamDocsRes.json().catch(() => ({})) : {};
        fetchedOrgDocs = [...new Map((orgDocsJson.documents || []).map((doc) => [doc.id, doc])).values()];
        // Filter consignment orders assigned to this specific agent
        fetchedConsignmentOrders = (consJson2.documents || []).filter(
          d => d.consignment_agent_id === agentId
        );
        setOrgDocuments(fetchedOrgDocs);
        setOrganizationFolderDocuments(
          [...new Map((teamDocsJson.documents || fetchedOrgDocs).map((doc) => [doc.id, doc])).values()]
        );
        setAgentConsignmentOrders(fetchedConsignmentOrders);
      } catch {
        setOrgDocuments([]);
        setOrganizationFolderDocuments([]);
        setAgentConsignmentOrders([]);
      }

      // Always build derived commission rows from actual documents when no real records exist.
      // This fixes agents who have orders but no agent_commissions table entries yet.
      //
      // Phase 19b: only fall back to doc-derived when there are NO commissions
      // at all (not "no order commissions"). Otherwise new_client_bonus rows
      // would be hidden because they don't satisfy the type==='order' filter
      // — exactly the bug Sam saw on Nicolas after the bonus backfill.
      const commList = commJson.commissions || [];
      if (commList.length === 0) {
        const orderDocs = fetchedOrgDocs.filter(
          (d) => d.document_type === 'order' && !d.deleted_at && (Number(d.total_amount) || 0) > 0
        );
        const { rate } = resolveEffectiveRate(found, loadedOrganization);
        setDocDerivedRows(orderDocs.map((d) => {
          const grossTotal = Number(d.total_amount) || 0;
          const rawShipping = Number(
            d?.metadata?.shipping_amount ??
              d?.metadata?.formState?.deliveryCost ??
              0,
          );
          const shipping = Number.isFinite(rawShipping) && rawShipping > 0 ? rawShipping : 0;
          const netTotal = Math.max(0, grossTotal - shipping);
          return {
            id: `doc-${d.id}`,
            type: 'order',
            created_at: d.created_at,
            // order_total is the POST-shipping commissionable base (matches
            // what the real commission hook stores). gross_total is shown
            // in a separate column so Sam sees both numbers.
            order_total: netTotal,
            gross_total: grossTotal,
            commission_rate: rate,
            commission_amount: Math.round(netTotal * rate / 100 * 100) / 100,
            document: {
              client_company: d.client_company || d.client_name || 'Order',
              id: d.id,
              order_channel: d.order_channel,
              total_amount: grossTotal,
              event: d.events || null,
            },
            _derived: true,
          };
        }));
      } else {
        setDocDerivedRows([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load details');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Row-level mutations (Paid?, Undo, Delete) only change commission rows and
  // the KPI summary, both of which come from a single endpoint. load() fires
  // 8-11 requests — including three /api/documents pages of 200 — and hides
  // the page behind a spinner, which is what made ticking Paid? feel like a
  // five second freeze. This refetches just what changed, with no spinner.
  //
  // Calls that arrive while one is in flight collapse into a single follow-up
  // pass, so ticking ten boxes in a row still costs at most two requests.
  const refreshInFlight = useRef(null);
  const refreshQueued = useRef(false);
  const refreshCommissions = useCallback(() => {
    if (!agentId) return Promise.resolve();
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return refreshInFlight.current;
    }
    const run = async () => {
      do {
        refreshQueued.current = false;
        try {
          const res = await fetch(`/api/commissions?agent_id=${encodeURIComponent(agentId)}`);
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            setCommissions(json.commissions || []);
            setSummary(json.summary || null);
          }
        } catch {
          // Silent: the optimistic state already reflects the change and the
          // next interaction will resync. Surfacing a refresh error here would
          // be more confusing than the stale KPI it replaces.
        }
      } while (refreshQueued.current);
    };
    const promise = run().finally(() => {
      refreshInFlight.current = null;
    });
    refreshInFlight.current = promise;
    return promise;
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExtractCommission = useCallback(async () => {
    if (!agentId) return;
    setExtracting(true);
    setProposedConfig(null);
    setConfigMsg(null);
    try {
      const textRes = await fetch(`/api/agents/${agentId}/contract-text`);
      const textData = await textRes.json();
      if (!textData.text) { setConfigMsg('No contract text found.'); return; }

      const extRes = await fetch(`/api/agents/${agentId}/extract-commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractText: textData.text }),
      });
      const extData = await extRes.json();
      if (extRes.ok && extData.proposed) {
        setProposedConfig(extData.proposed);
      } else {
        setConfigMsg(extData.error || 'Extraction failed');
      }
    } catch {
      setConfigMsg('Failed to extract commission structure');
    } finally {
      setExtracting(false);
    }
  }, [agentId]);

  const handleConfirmConfig = useCallback(async () => {
    if (!proposedConfig || !agentId) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/commission-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: proposedConfig }),
      });
      const d = await res.json();
      if (res.ok) {
        setProposedConfig(null);
        setConfigMsg('Commission structure saved!');
        await load();
      } else {
        setConfigMsg(d.error || 'Failed to save');
      }
    } catch {
      setConfigMsg('Failed to save commission config');
    } finally {
      setSavingConfig(false);
    }
  }, [proposedConfig, agentId, load]);

  const openCreatePayment = () => {
    setEditingPayment(null);
    setPaymentAmount('');
    setPaymentNotes('');
    setPaymentReportId('');
    setPaymentInvoice('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setShowPaymentModal(true);
  };

  const openEditPayment = (row) => {
    setEditingPayment(row);
    setPaymentAmount(String(row.amount ?? ''));
    setPaymentNotes(row.notes || '');
    setPaymentReportId(row.report_id || '');
    setPaymentInvoice(row.invoice_number || '');
    // payment_date may be a full ISO timestamp; the date input wants YYYY-MM-DD
    const d = row.payment_date ? new Date(row.payment_date) : new Date();
    setPaymentDate(d.toISOString().split('T')[0]);
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setEditingPayment(null);
  };

  // Report ids that have already been settled by a recorded payment — so the
  // dropdown can flag them and mom doesn't accidentally pay the same report twice.
  const paidReportIds = useMemo(
    () => new Set((payments || []).map((p) => p.report_id).filter(Boolean)),
    [payments],
  );

  const reportsById = useMemo(() => {
    const m = {};
    for (const r of reports || []) m[r.id] = r;
    return m;
  }, [reports]);

  // The report a manual "Mark reported" would attach a row to. The list comes
  // back newest first, so it's simply the first one.
  const lastReport = useMemo(() => (reports || [])[0] || null, [reports]);

  // Picking a report in the modal prefills the amount with its total so mom
  // just confirms. She can still override before saving.
  const handleSelectPaymentReport = (reportId) => {
    setPaymentReportId(reportId);
    const r = (reports || []).find((x) => x.id === reportId);
    if (r && r.total_due != null) {
      setPaymentAmount(String(r.total_due).replace('.', ','));
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const amt = parseAmount(paymentAmount);
    if (Number.isNaN(amt) || amt <= 0) return;
    setSavingPayment(true);
    try {
      const url = editingPayment
        ? `/api/agent-payments/${editingPayment.id}`
        : '/api/agent-payments';
      const method = editingPayment ? 'PATCH' : 'POST';
      const body = editingPayment
        ? {
            amount: amt,
            notes: paymentNotes,
            payment_date: paymentDate,
          }
        : {
            agent_id: agentId,
            amount: amt,
            notes: paymentNotes,
            payment_date: new Date(paymentDate).toISOString(),
            report_id: paymentReportId || null,
            invoice_number: paymentInvoice.trim() || null,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save payment');
      }
      closePaymentModal();
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentReportId('');
      setPaymentInvoice('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (row) => {
    if (!row?.id) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('Delete this payment? This cannot be undone.')
      : true;
    if (!ok) return;
    setDeletingPaymentId(row.id);
    try {
      const res = await fetch(`/api/agent-payments/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to delete payment');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!agent?.organization_id || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/organizations/${agent.organization_id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail.trim().toLowerCase(), role: 'member' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add member');
      setMemberEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  // Phase 19b — toggle the per-commission "customer paid" flag.
  // Optimistic: flips the local row immediately so the checkbox reacts
  // instantly, then revalidates from the server. On failure, reverts and
  // surfaces the error.
  //
  // Rows are tracked in a Set rather than a single id so several ticks can be
  // in flight at once — waiting for the previous row to finish was the other
  // half of the "Paid? is slow" complaint.
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  const inFlightPaidRef = useRef(new Set());
  const [togglingSynaliaDocId, setTogglingSynaliaDocId] = useState(null);
  const [savingInvoiceId, setSavingInvoiceId] = useState(null);
  const [invoiceDrafts, setInvoiceDrafts] = useState({});
  const [invoiceSaveState, setInvoiceSaveState] = useState(null);

  const markToggling = useCallback((ids, busy) => {
    setTogglingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (busy) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const handleToggleCustomerPaid = useCallback(async (commissionId, nextPaid) => {
    if (!commissionId || inFlightPaidRef.current.has(commissionId)) return;
    inFlightPaidRef.current.add(commissionId);
    markToggling([commissionId], true);
    setCommissions((prev) => applyCustomerPaidLocally(prev, [commissionId], nextPaid));
    try {
      const res = await fetch(`/api/commissions/${commissionId}/customer-paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: nextPaid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to update');
      // Refresh the summary KPIs from the source of truth.
      await refreshCommissions();
    } catch (err) {
      setCommissions((prev) => applyCustomerPaidLocally(prev, [commissionId], !nextPaid));
      setError(err.message || 'Failed to update commission');
    } finally {
      inFlightPaidRef.current.delete(commissionId);
      markToggling([commissionId], false);
    }
  }, [refreshCommissions, markToggling]);

  // Bulk Paid?/Unpaid for the rows selected with the checkbox column.
  // One request for the whole selection instead of one per row, which keeps it
  // well inside the per-IP rate limit and makes twenty rows feel like one.
  const [selectedCommissionIds, setSelectedCommissionIds] = useState(() => new Set());
  const [bulkPaidBusy, setBulkPaidBusy] = useState(false);

  const toggleCommissionSelected = useCallback((commissionId) => {
    setSelectedCommissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(commissionId)) next.delete(commissionId);
      else next.add(commissionId);
      return next;
    });
  }, []);

  const clearCommissionSelection = useCallback(() => {
    setSelectedCommissionIds(new Set());
  }, []);

  const handleBulkCustomerPaid = useCallback(async (nextPaid) => {
    if (bulkPaidBusy) return;
    const ids = [...selectedCommissionIds];
    if (ids.length === 0) return;
    // Skip rows already in the requested state so we never re-stamp a
    // customer_paid_at that mom set weeks ago.
    const toSend = selectableForBulk(commissions, ids, nextPaid);
    if (toSend.length === 0) {
      clearCommissionSelection();
      return;
    }
    setBulkPaidBusy(true);
    markToggling(toSend, true);
    setCommissions((prev) => applyCustomerPaidLocally(prev, toSend, nextPaid));
    try {
      await sendBulkCustomerPaid(toSend, nextPaid);
      clearCommissionSelection();
      await refreshCommissions();
    } catch (err) {
      setCommissions((prev) => applyCustomerPaidLocally(prev, toSend, !nextPaid));
      setError(err.message || 'Failed to update commissions');
    } finally {
      markToggling(toSend, false);
      setBulkPaidBusy(false);
    }
  }, [bulkPaidBusy, selectedCommissionIds, commissions, clearCommissionSelection, markToggling, refreshCommissions]);

  // Drop selected ids that no longer exist (deleted, or settled by a payout in
  // another tab) so the bulk bar can never act on a stale row.
  useEffect(() => {
    setSelectedCommissionIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(commissions.map((c) => c.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [commissions]);

  const handleChangeJewelerGroup = useCallback(async (docId, nextJewelerGroup) => {
    if (!docId || togglingSynaliaDocId === docId) return;
    const jewelerGroup = normalizeJewelerGroup(nextJewelerGroup);
    const nextSynalia = isSynaliaJewelerGroup(jewelerGroup);
    setTogglingSynaliaDocId(docId);
    const patchDocMeta = (prevDocs) =>
      prevDocs.map((d) =>
        d.id === docId
          ? {
              ...d,
              metadata: {
                ...(d.metadata || {}),
                jewelerGroup,
                synalia: nextSynalia,
                formState: { ...(d.metadata?.formState || {}), jewelerGroup, synalia: nextSynalia },
              },
            }
          : d,
      );
    setCommissions((prev) =>
      prev.map((c) => {
        const linkedId = c.document_id || c.document?.id;
        if (linkedId !== docId || !c.document) return c;
        return {
          ...c,
          document: {
            ...c.document,
            metadata: {
              ...(c.document.metadata || {}),
              jewelerGroup,
              synalia: nextSynalia,
              formState: { ...(c.document.metadata?.formState || {}), jewelerGroup, synalia: nextSynalia },
            },
          },
        };
      }),
    );
    setOrgDocuments(patchDocMeta);
    try {
      const res = await fetch(`/api/documents/${docId}/synalia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jewelerGroup }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to update');
    } catch (err) {
      await load();
      setError(err.message || 'Failed to update Synalia flag');
    } finally {
      setTogglingSynaliaDocId(null);
    }
  }, [load, togglingSynaliaDocId]);

  // Undo a payout: revert a PAID commission back to 'pending' (keeping the
  // customer-paid tick) so it returns to "Ready to pay" and re-enters the next
  // payout. For "we marked it paid but didn't actually pay the agent".
  const handleRevertPaid = useCallback(async (commissionId) => {
    if (!commissionId || inFlightPaidRef.current.has(commissionId)) return;
    inFlightPaidRef.current.add(commissionId);
    markToggling([commissionId], true);
    // Optimistic: flip the row back to pending immediately.
    const prevRows = commissions;
    setCommissions((prev) =>
      prev.map((c) =>
        c.id === commissionId ? { ...c, status: 'pending', paid_at: null } : c,
      ),
    );
    try {
      const res = await fetch(`/api/commissions/${commissionId}/revert-paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to undo payout');
      // Refresh the summary KPIs from the source of truth.
      await refreshCommissions();
    } catch (err) {
      setCommissions(prevRows);
      setError(err.message || 'Failed to undo payout');
    } finally {
      inFlightPaidRef.current.delete(commissionId);
      markToggling([commissionId], false);
    }
  }, [refreshCommissions, commissions, markToggling]);

  // Refusals from the per-row status actions below. Their own banner, not the
  // page-level `error`: one declined click must not replace the whole
  // commission history.
  const [rowActionError, setRowActionError] = useState('');

  // Force a row into or out of "Reported" by hand.
  //
  // Report generation sets report_id itself, but rows do get stranded: swept
  // into a report before the Paid? tick existed, or linked when the send went
  // wrong. A linked row is excluded from every later report, so without this
  // there is no way back — the commission just sits there.
  const handleToggleReported = useCallback(async (commissionId, nextReported) => {
    if (!commissionId || inFlightPaidRef.current.has(commissionId)) return;
    inFlightPaidRef.current.add(commissionId);
    markToggling([commissionId], true);
    setRowActionError('');
    try {
      const res = await fetch(`/api/commissions/${commissionId}/reported`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported: nextReported }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to update the report link');
      await refreshCommissions();
    } catch (err) {
      setRowActionError(err.message || 'Failed to update the report link');
    } finally {
      inFlightPaidRef.current.delete(commissionId);
      markToggling([commissionId], false);
    }
  }, [refreshCommissions, markToggling]);

  // Settle one line by hand, skipping Record Payment.
  //
  // Reported rows are excluded from every later report, so when the agent was
  // paid outside the app — or the payment got recorded against a different
  // report — Record Payment can never reach that line again and it sits in
  // Reported forever. This is the way out. Undo reverses it.
  const handleForcePaid = useCallback(async (commissionId) => {
    if (!commissionId || inFlightPaidRef.current.has(commissionId)) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm(
        'Mark this commission as paid out?\n\n'
        + 'Use this when the agent has already been paid but the line stayed on '
        + 'Reported. It does not send money or record a payment — it only moves '
        + 'the line to Paid. You can Undo it afterwards.',
      )
      : true;
    if (!ok) return;
    inFlightPaidRef.current.add(commissionId);
    markToggling([commissionId], true);
    setRowActionError('');
    try {
      const res = await fetch(`/api/commissions/${commissionId}/force-paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to mark the commission paid');
      // Refetch rather than patch locally: the request may also have settled
      // the order's new-client bonus, which is a different row.
      await refreshCommissions();
    } catch (err) {
      setRowActionError(err.message || 'Failed to mark the commission paid');
    } finally {
      inFlightPaidRef.current.delete(commissionId);
      markToggling([commissionId], false);
    }
  }, [refreshCommissions, markToggling]);

  // Delete a manual commission entry (quick order or ad-hoc bonus). Used to
  // remove a mistakenly-added row. The API refuses order-linked and paid-out
  // rows, so we only surface this button on safe-to-delete manual entries.
  const handleDeleteCommission = useCallback(async (commissionId) => {
    if (!commissionId || inFlightPaidRef.current.has(commissionId)) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('Delete this entry? This cannot be undone.')
      : true;
    if (!ok) return;
    inFlightPaidRef.current.add(commissionId);
    markToggling([commissionId], true);
    try {
      const res = await fetch(`/api/commissions/${commissionId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to delete entry');
      await refreshCommissions();
    } catch (err) {
      setError(err.message || 'Failed to delete entry');
    } finally {
      inFlightPaidRef.current.delete(commissionId);
      markToggling([commissionId], false);
    }
  }, [refreshCommissions, markToggling]);

  // Grant the new-client bonus for one order. In 'manual' mode nothing is
  // created on save, so this button is the only way a bonus comes into
  // existence — the admin decides per client whether it is warranted.
  const [addingBonusRowId, setAddingBonusRowId] = useState(null);
  // A refusal here is about one row, so it gets its own message above the
  // table. The page-level `error` replaces the whole page, which would
  // throw away the commission history over a single declined click.
  const [bonusError, setBonusError] = useState('');
  const handleAddNewClientBonus = useCallback(async (row) => {
    const documentId = row?.document_id || row?.document?.id;
    if (!documentId || !agentId || addingBonusRowId) return;
    setAddingBonusRowId(row.id);
    setBonusError('');
    try {
      const res = await fetch('/api/commissions/new-client-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, document_id: documentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to add the bonus');
      await refreshCommissions();
    } catch (err) {
      setBonusError(err.message || 'Failed to add the bonus');
    } finally {
      setAddingBonusRowId(null);
    }
  }, [agentId, addingBonusRowId, refreshCommissions]);

  // Save the manual invoice number an admin types against a commission row.
  // Optimistic + fire-on-blur: writes the local row immediately so the field
  // keeps what was typed, then persists. No full reload (would steal focus /
  // reset other inputs) — KPIs don't depend on the invoice note.
  const handleSaveInvoice = useCallback(async (commissionId, rawValue) => {
    if (!commissionId || String(commissionId).startsWith('doc-')) return;
    const value = (rawValue || '').trim();
    const current = commissions.find((c) => c.id === commissionId);
    // No-op when unchanged (avoids a write on every blur).
    if (current && (current.invoice_number || '') === value) return;
    setSavingInvoiceId(commissionId);
    setInvoiceSaveState(null);
    const prevRows = commissions;
    setCommissions((prev) =>
      prev.map((c) =>
        c.id === commissionId ? { ...c, invoice_number: value || null } : c,
      ),
    );
    try {
      const res = await fetch(`/api/commissions/${commissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_number: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save invoice number');
      setInvoiceSaveState({ id: commissionId, kind: 'success', message: 'Saved' });
    } catch (err) {
      setCommissions(prevRows);
      setInvoiceDrafts((prev) => ({
        ...prev,
        [commissionId]: current?.invoice_number || '',
      }));
      setInvoiceSaveState({ id: commissionId, kind: 'error', message: 'Save failed' });
      setError(err.message || 'Failed to save invoice number');
    } finally {
      setSavingInvoiceId(null);
    }
  }, [commissions]);

  const orderRows = useMemo(
    () => commissions.filter((c) => c.type === 'order'),
    [commissions]
  );

  const [activeTab, setActiveTab] = useState('financials');

  useEffect(() => {
    if (activeTab === 'synalia' && agent && !isSynaliaAgentEmail(agent.email)) {
      setActiveTab('financials');
    }
  }, [activeTab, agent]);

  // ── derived financials ──────────────────────────────────────────────────────
  const s = summary || {};
  const st = agent?.stats || {};
  const { rate: commRate, source: commRateSource } = resolveEffectiveRate(agent, orgData);
  const orderDocsList = orgDocuments.filter(d => d.document_type === 'order' && !d.deleted_at);
  const docRevenue = orderDocsList.reduce((acc, d) => acc + (Number(d.total_amount) || 0), 0);
  const docCommission = Math.round(docRevenue * commRate / 100 * 100) / 100;
  const totalEarned =
    (s.total_earned || 0) > 0 ? s.total_earned
    : (st.effective_total_commission || 0) > 0 ? st.effective_total_commission
    : docCommission;
  const totalPaid = s.total_paid_out || 0;
  const pendingBalance = Math.max(0, totalEarned - totalPaid);
  const orderRevenue = docRevenue > 0 ? docRevenue
    : (s.order_count || 0) > 0
      ? orderRows.reduce((acc, c) => acc + (Number(c.order_total) || 0), 0)
      : (st.effective_revenue || 0);
  const activeConsignment = agentConsignmentOrders.filter(d => !d.metadata?.consignment?.returned_at);
  const usesOrgSettlement = Boolean(agent?.organization_id && organizationMembers.length > 1);

  // Synalia / groupement is a Nicolas-only workflow — hide the tab on every
  // other agent so Sarah's team (and everyone else) is not cluttered by it.
  const showSynaliaTab = isSynaliaAgentEmail(agent?.email);

  const synaliaOrderCount = useMemo(
    () => {
      if (!showSynaliaTab) return 0;
      return orgDocuments.filter((d) =>
        d.document_type === 'order'
        && d.status === 'sent'
        && !d.deleted_at
        && isSynaliaJewelerGroup(jewelerGroupFromLegacy(d.metadata)),
      ).length;
    },
    [orgDocuments, showSynaliaTab],
  );

  // ── avatar initials ──────────────────────────────────────────────────────────
  const initials = (agent?.full_name || agent?.email || '?')
    .split(/[\s.@]+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  // Phase 22 (2026-05-13): Reports tab merged into Financials so mom sees
  // "ready to pay" + "send report now" + commission history on a single
  // screen, instead of bouncing between two tabs to do one workflow.
  const TABS = [
    { id: 'financials', label: 'Financials' },
    ...(showSynaliaTab
      ? [{ id: 'synalia', label: synaliaOrderCount > 0 ? `Synalia (${synaliaOrderCount})` : 'Synalia' }]
      : []),
    { id: 'consignment', label: `Consignment (${agentConsignmentOrders.length})` },
    { id: 'organisation', label: 'Organisation' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', fontFamily: fonts.body, background: '#f8f7fb' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* breadcrumb */}
        <button
          onClick={() => router.push('/admin/agents')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 18, padding: 0, border: 'none', background: 'transparent', color: colors.lovelabMuted, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
        >
          Sales Team <span aria-hidden="true">/</span> <span style={{ color: colors.inkPlum }}>{agent?.full_name || 'Agent'}</span>
        </button>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: colors.lovelabMuted }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 14, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : (
          <>
            {/* ── Agent identity ────────────────────────────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 16, padding: '22px 24px', marginBottom: 16, boxShadow: '0 8px 30px rgba(74,37,69,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* avatar */}
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: colors.inkPlum, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 800, flexShrink: 0 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h1 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: colors.charcoal, margin: 0 }}>
                      {agent?.full_name || agent?.email}
                    </h1>
                    <span style={{ fontSize: 10, fontWeight: 800, color: agent?.agent_status === 'active' ? '#166534' : '#6b7280', background: agent?.agent_status === 'active' ? '#f0fdf4' : '#f3f4f6', border: `1px solid ${agent?.agent_status === 'active' ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 20, padding: '3px 9px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {agent?.agent_status || 'unknown'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.lovelabMuted }}>{agent?.email}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const bonusMode = resolveBonusMode(agent);
                      const bonusOn = bonusMode !== 'off';
                      const bonusAmt = Number(agent?.new_client_bonus_amount) || 0;
                      const label = !bonusOn || bonusAmt <= 0
                        ? '+ New client bonus'
                        : bonusMode === 'manual'
                        ? `${fmt(bonusAmt)} / new client — you decide`
                        : `+${fmt(bonusAmt)} / new client`;
                      return (
                        <button
                          type="button"
                          onClick={() => setShowNewClientBonusModal(true)}
                          title={
                            bonusMode === 'manual'
                              ? 'Nothing is added automatically — add the bonus per order from the table below'
                              : bonusMode === 'auto'
                              ? 'Added automatically on the first order from a new client'
                              : 'Set up the new-client bonus'
                          }
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: bonusOn ? '#fff' : colors.inkPlum,
                            background: bonusOn ? colors.inkPlum : '#fff',
                            border: `1px solid ${colors.inkPlum}`,
                            borderRadius: 20,
                            padding: '2px 9px',
                            cursor: 'pointer',
                            fontFamily: fonts.body,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

                <div data-testid="effective-rate-card" style={{ minWidth: 180, padding: '14px 18px', borderRadius: 12, border: `1px solid ${colors.lineGray}`, background: '#fcfbfd', textAlign: 'center' }}>
                  <div style={{ color: colors.inkPlum, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{commRate}%</div>
                  <div style={{ color: colors.lovelabMuted, fontSize: 10, lineHeight: 1.35, marginTop: 7 }}>
                    Commission rate
                    <br />
                    {commRateSource === 'organization'
                      ? `from ${orgData?.name || 'organization'}`
                      : commRateSource === 'agent'
                        ? 'custom agent rate'
                        : 'not configured'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.lineGray}` }}>
                {agent?.agent_contract_url && (
                  <button
                    onClick={() => setContractChatOpen(true)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Contract Q&A
                  </button>
                )}
                <button
                  onClick={() => setShowQuickOrderModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
                >
                  Add Quick Order
                </button>
                <button
                  onClick={() => setShowBonusModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 600 }}
                >
                  Add Bonus
                </button>
                {usesOrgSettlement ? (
                  <button
                    onClick={() => router.push(`/admin/organizations/${agent.organization_id}`)}
                    title="Multi-member organizations are paid once from the organization settlement page."
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 700 }}
                  >
                    Organization Settlement
                  </button>
                ) : (
                  <button
                    onClick={openCreatePayment}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: 'pointer', fontFamily: fonts.body, fontSize: 12, fontWeight: 700 }}
                  >
                    Record Payment
                  </button>
                )}
              </div>
            </div>

            {/* ── The three numbers an admin needs first ───────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                {
                  label: 'EARNED',
                  value: fmt2(totalEarned),
                  sub: `${s.order_count || orderDocsList.length} order commission${(s.order_count || orderDocsList.length) === 1 ? '' : 's'}`,
                  accent: colors.inkPlum,
                },
                {
                  label: 'PAID OUT',
                  value: fmt2(totalPaid),
                  sub: 'transferred to agent',
                  accent: '#15803d',
                },
                {
                  label: 'OUTSTANDING',
                  value: fmt2(pendingBalance),
                  sub: 'still owed to agent',
                  accent: '#b45309',
                },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 5px 18px rgba(74,37,69,0.035)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: colors.lovelabMuted, marginBottom: 6, textTransform: 'uppercase' }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.accent, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 5 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── AI contract config banner ────────────────────────────────── */}
            {agent?.agent_contract_url && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: colors.lovelabMuted }}>
                    {agent?.agent_commission_config
                      ? <><strong style={{ color: colors.inkPlum }}>Commission config:</strong> {agent.agent_commission_config.type}{agent.agent_commission_config.description ? ` — ${agent.agent_commission_config.description}` : ''}</>
                      : 'No AI commission config extracted yet.'}
                  </div>
                  <button
                    onClick={handleExtractCommission}
                    disabled={extracting}
                    style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: extracting ? 'wait' : 'pointer', fontFamily: fonts.body, fontSize: 11, fontWeight: 600, flexShrink: 0, opacity: extracting ? 0.6 : 1 }}
                  >
                    {extracting ? 'Extracting…' : (agent?.agent_commission_config ? 'Re-extract' : 'Extract from Contract')}
                  </button>
                </div>
                {proposedConfig && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>AI detected this structure — confirm?</div>
                    <div style={{ color: '#374151', marginBottom: 8 }}>
                      <strong>Type:</strong> {proposedConfig.type}
                      {proposedConfig.description && <> — {proposedConfig.description}</>}
                      {proposedConfig.type === 'tiered' && (
                        <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
                          {(proposedConfig.tiers || []).map((t, i) => (
                            <li key={i}>{t.upTo ? `Up to €${t.upTo.toLocaleString()}: ${t.rate}%` : `Above: ${t.rate}%`}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleConfirmConfig} disabled={savingConfig} style={{ padding: '6px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: savingConfig ? 0.6 : 1 }}>
                        {savingConfig ? 'Saving…' : 'Confirm & Save'}
                      </button>
                      <button onClick={() => setProposedConfig(null)} style={{ padding: '6px 12px', background: 'none', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#1d4ed8' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {configMsg && (
                  <div style={{ marginTop: 8, fontSize: 12, color: /saved|success/i.test(configMsg) ? '#059669' : '#dc2626' }}>{configMsg}</div>
                )}
              </div>
            )}

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${colors.lineGray}`, marginBottom: 20 }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '10px 18px',
                    border: 'none',
                    borderBottom: activeTab === t.id ? `2px solid ${colors.inkPlum}` : '2px solid transparent',
                    marginBottom: -2,
                    background: 'none',
                    cursor: 'pointer',
                    fontFamily: fonts.body,
                    fontSize: 13,
                    fontWeight: activeTab === t.id ? 700 : 500,
                    color: activeTab === t.id ? colors.inkPlum : colors.lovelabMuted,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Financials ───────────────────────────────────────────── */}
            {/*
              Phase 19b — stacked vertically (was a 2-col grid). The new
              7-column Commission History needs full container width;
              cramming it next to the Payments Ledger at ~480px clipped
              the last two columns (Customer paid?, Status). Stacking
              keeps both tables breathable on mobile and desktop.
            */}
            {activeTab === 'financials' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                {agent && (
                  <CommissionReportsCard
                    agentId={agent.id}
                    agentName={agent.full_name || agent.email}
                    // Phase 31: agents in a multi-member org are settled via ONE
                    // org-level report/payment — per-agent sending is disabled to
                    // prevent double settlement and split payouts.
                    orgSettlement={
                      agent.organization_id && organizationMembers.length > 1
                        ? { organizationId: agent.organization_id, organizationName: orgData?.name || 'the organization' }
                        : null
                    }
                  />
                )}

                {/* Commission */}
                <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                    Orders &amp; Commission
                  </div>
                  {(() => {
                    const allRows = commissions.length > 0 ? commissions : docDerivedRows;
                    const isDerived = commissions.length === 0 && docDerivedRows.length > 0;
                    if (allRows.length === 0) return (
                      <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No commissions yet.</div>
                    );
                    // Counts per status for the filter chips; only render a chip
                    // when it has at least one row (keeps the bar uncluttered).
                    const counts = allRows.reduce((acc, r) => {
                      const k = commissionStatusKey(r);
                      acc[k] = (acc[k] || 0) + 1;
                      return acc;
                    }, {});
                    const activeFilter = commissionFilter;
                    const visibleRows = activeFilter === 'all'
                      ? allRows
                      : allRows.filter((r) => commissionStatusKey(r) === activeFilter);
                    // Orders where the new-client bonus is still an open
                    // decision. Empty unless the agent has a bonus amount and
                    // a mode other than 'off'.
                    const bonusEligibleIds = eligibleManualBonusRowIds(allRows, { agent, isDerived });
                    const bonusAmount = Number(agent?.new_client_bonus_amount) || 0;
                    // Rows the bulk Paid? action can act on — same rule as the
                    // per-row checkbox, so the two can never disagree.
                    const selectableVisibleIds = isDerived
                      ? []
                      : visibleRows
                          .filter((r) =>
                            r.status !== 'paid' &&
                            r.status !== 'cancelled' &&
                            !!r.id &&
                            !String(r.id).startsWith('doc-'))
                          .map((r) => r.id);
                    const selectedVisibleIds = selectableVisibleIds.filter((id) => selectedCommissionIds.has(id));
                    const allVisibleSelected =
                      selectableVisibleIds.length > 0 &&
                      selectedVisibleIds.length === selectableVisibleIds.length;
                    const toggleSelectAllVisible = () => {
                      setSelectedCommissionIds((prev) => {
                        const next = new Set(prev);
                        for (const id of selectableVisibleIds) {
                          if (allVisibleSelected) next.delete(id);
                          else next.add(id);
                        }
                        return next;
                      });
                    };
                    const selectedCount = selectedCommissionIds.size;
                    return (
                      <>
                        {bonusError && (
                          <div role="alert" style={{ padding: '8px 14px', background: '#fef2f2', fontSize: 12, color: '#991b1b', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span>{bonusError}</span>
                            <button
                              type="button"
                              onClick={() => setBonusError('')}
                              aria-label="Dismiss"
                              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700, fontSize: 12, padding: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {rowActionError && (
                          <div role="alert" style={{ padding: '8px 14px', background: '#fef2f2', fontSize: 12, color: '#991b1b', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span>{rowActionError}</span>
                            <button
                              type="button"
                              onClick={() => setRowActionError('')}
                              aria-label="Dismiss"
                              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700, fontSize: 12, padding: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {/* Status filter chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: `1px solid ${colors.lineGray}`, background: '#fcfbfe' }}>
                          {COMMISSION_FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0).map((f) => {
                            const count = f.key === 'all' ? allRows.length : (counts[f.key] || 0);
                            const isActive = activeFilter === f.key;
                            return (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => setCommissionFilter(f.key)}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '4px 10px',
                                  borderRadius: 20,
                                  cursor: 'pointer',
                                  fontFamily: fonts.body,
                                  border: `1px solid ${isActive ? colors.inkPlum : colors.lineGray}`,
                                  background: isActive ? colors.inkPlum : '#fff',
                                  color: isActive ? '#fff' : colors.charcoal,
                                }}
                              >
                                {f.label} <span style={{ opacity: 0.7 }}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedCount > 0 && (
                          <div
                            data-testid="bulk-paid-bar"
                            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${colors.lineGray}`, background: '#f3f0f8' }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>
                              {selectedCount} selected
                            </span>
                            <button
                              type="button"
                              onClick={() => handleBulkCustomerPaid(true)}
                              disabled={bulkPaidBusy}
                              style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', background: colors.inkPlum, color: '#fff', cursor: bulkPaidBusy ? 'default' : 'pointer', fontFamily: fonts.body, opacity: bulkPaidBusy ? 0.6 : 1 }}
                            >
                              {bulkPaidBusy ? 'Saving…' : `Mark ${selectedCount} as paid`}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkCustomerPaid(false)}
                              disabled={bulkPaidBusy}
                              style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: bulkPaidBusy ? 'default' : 'pointer', fontFamily: fonts.body, opacity: bulkPaidBusy ? 0.6 : 1 }}
                            >
                              Mark as unpaid
                            </button>
                            <button
                              type="button"
                              onClick={clearCommissionSelection}
                              disabled={bulkPaidBusy}
                              style={{ fontSize: 11, fontWeight: 700, color: colors.lovelabMuted, background: 'none', border: 'none', cursor: bulkPaidBusy ? 'default' : 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                        {visibleRows.length === 0 ? (
                          <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>
                            No {activeFilter} commissions.
                          </div>
                        ) : (
                        <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                          <thead>
                            <tr style={{ background: '#faf8fc' }}>
                              <th style={{ ...th, textAlign: 'center', width: 34 }}>
                                {selectableVisibleIds.length > 0 && (
                                  <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleSelectAllVisible}
                                    aria-label="Select all rows"
                                    title="Select every row shown, then use the bulk Paid? buttons"
                                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colors.inkPlum }}
                                  />
                                )}
                              </th>
                              <th style={th}>Date</th>
                              <th style={th}>Client</th>
                              <th style={th}>Fair</th>
                              <th style={{ ...th, textAlign: 'right' }} title="The full order total as invoiced to the customer (includes shipping).">Total</th>
                              <th style={{ ...th, textAlign: 'right' }} title="Order total minus shipping. Commission is a % of this number.">Net</th>
                              <th style={{ ...th, textAlign: 'right' }}>Rate</th>
                              <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                              <th style={th} title="Optional: type the matching invoice number so you can reconcile this commission against your accounting. Saves automatically.">Invoice #</th>
                              <th style={{ ...th, textAlign: 'center' }} title="Tick when the customer has paid this order. Only ticked rows are included in the next monthly payout.">Paid?</th>
                              <th style={{ ...th, textAlign: 'center' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.map((row) => {
                              const isBonus = row.type === 'new_client_bonus' || row.type === 'bonus';
                              const isCustomerPaid = !!row.customer_paid_at;
                              const isPaidOut = row.status === 'paid';
                              const isCancelled = row.status === 'cancelled';
                              const canToggle = !isDerived && !isPaidOut && !isCancelled && !!row.id && !String(row.id).startsWith('doc-');
                              const rowBusy = togglingIds.has(row.id);
                              // Any real commission row can be deleted (quick order,
                              // bonus, order commission, paid-out, cancelled…).
                              // Doc-derived placeholder rows aren't real DB rows so
                              // there's nothing to delete.
                              const canDelete = !isDerived && !!row.id && !String(row.id).startsWith('doc-');
                              const canEditInvoice = !isDerived && !!row.id && !String(row.id).startsWith('doc-');
                              // Phase 29: a row that's been pulled into a report
                              // (report_id set) but not yet paid out is
                              // "Reported" — sent, awaiting the Record Payment
                              // step. The Paid? tick is deliberately NOT part of
                              // this: rows swept into a report before that tick
                              // existed have no date, and calling them "Awaiting"
                              // hid them while report_id kept them out of every
                              // later report.
                              const isReported = !isPaidOut && !isCancelled && !!row.report_id;
                              // Settling by hand only makes sense once the money
                              // is owed: the customer paid, or the line already
                              // went out on a report. An "Awaiting" row needs
                              // the Paid? tick first, so a stray click can't
                              // pay out an order nobody has settled.
                              const canForcePaid = canToggle && (isCustomerPaid || isReported);
                              const status = isCancelled
                                ? { label: 'Cancelled', bg: '#fee2e2', fg: '#991b1b' }
                                : isPaidOut
                                ? { label: 'Paid', bg: '#16a34a', fg: '#ffffff' }
                                : isReported
                                ? { label: 'Reported', bg: '#eef2ff', fg: '#3730a3' }
                                : isCustomerPaid
                                ? { label: 'Ready', bg: '#f0fdf4', fg: '#166534' }
                                : { label: 'Awaiting', bg: '#fff7ed', fg: '#9a3412' };
                              const clientLabel = row.type === 'new_client_bonus'
                                ? `New client bonus${row.document?.client_company ? ` — ${row.document.client_company}` : ''}`
                                : row.type === 'bonus'
                                ? 'Bonus'
                                : (row.document?.client_company || row.document?.client_name || row.client_label || 'Order');
                              const fairLabel = row.document?.event?.type === 'fair'
                                ? row.document.event.name
                                : row.document?.event?.name || 'Direct';
                              // Resolve gross total: doc-derived rows pre-compute it; real
                              // commission rows get it from the joined document. Fallback
                              // to net total when shipping data isn't available.
                              const netTotal = Number(row.order_total) || 0;
                              const grossTotal = Number(
                                row.gross_total ?? row.document?.total_amount ?? netTotal,
                              );
                              const hasShipping = isFinite(grossTotal) && grossTotal > netTotal;
                              // Commission rate display: prefer the row's stored rate; if
                              // it's 0/missing on an order row, fall back to the agent's
                              // rate so admins see a meaningful number for legacy rows.
                              const rowRate = Number(row.commission_rate) || 0;
                              const displayRate = isBonus ? null : (rowRate > 0 ? rowRate : commRate);
                              // Link to edit the underlying order. Works for both
                              // real commission rows (document_id) and doc-derived
                              // rows (document.id). Opens the order in the main app
                              // via the /?reEdit=<id> deep link so amounts/items can
                              // be edited and re-saved (which recalculates commission).
                              const docId = row.document_id || row.document?.id || null;
                              const canEditOrder = row.type === 'order' && !isCancelled && !!docId;
                              return (
                                <tr key={row.id} style={isCancelled ? { opacity: 0.55 } : undefined}>
                                  <td style={{ ...td, textAlign: 'center', width: 34 }}>
                                    {canToggle ? (
                                      <input
                                        type="checkbox"
                                        checked={selectedCommissionIds.has(row.id)}
                                        onChange={() => toggleCommissionSelected(row.id)}
                                        aria-label={`Select ${clientLabel}`}
                                        title="Select this row for a bulk Paid? action"
                                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colors.inkPlum }}
                                      />
                                    ) : null}
                                  </td>
                                  <td style={td}>
                                    {commissionDisplayDate(row)
                                      ? new Date(commissionDisplayDate(row)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                      : '—'}
                                  </td>
                                  <td style={{ ...td, fontSize: 12 }}>
                                    {clientLabel}
                                    {row.type === 'new_client_bonus' && (
                                      <span style={{ marginLeft: 5, fontSize: 9, color: colors.inkPlum, fontWeight: 700, background: '#f3f0f8', padding: '1px 5px', borderRadius: 3 }}>NEW</span>
                                    )}
                                    {row.document?.order_channel === 'b2c' && (
                                      <span style={{ marginLeft: 5, fontSize: 9, color: colors.luxeGold, fontWeight: 700, background: '#fef9ec', padding: '1px 5px', borderRadius: 3 }}>B2C</span>
                                    )}
                                    {bonusEligibleIds.has(row.id) && (
                                      <span style={{ marginLeft: 5, fontSize: 9, color: '#9a3412', fontWeight: 700, background: '#fff7ed', padding: '1px 5px', borderRadius: 3 }} title="First order from this customer for this agent — no new-client bonus has been given yet.">
                                        NEW CLIENT
                                      </span>
                                    )}
                                    {(canEditOrder || bonusEligibleIds.has(row.id)) && (
                                      <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {canEditOrder && (
                                          <a
                                            href={`/?reEdit=${docId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Open this order to edit its items and amount. Saving recalculates the commission."
                                            style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                          >
                                            Edit order
                                            <span aria-hidden="true">↗</span>
                                          </a>
                                        )}
                                        {bonusEligibleIds.has(row.id) && (
                                          <button
                                            type="button"
                                            onClick={() => handleAddNewClientBonus(row)}
                                            disabled={addingBonusRowId === row.id}
                                            title={`Give this agent the ${fmt2(bonusAmount)} new-client bonus for this customer. Nothing is added unless you click.`}
                                            style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, background: '#f3f0f8', border: `1px solid ${colors.inkPlum}`, borderRadius: 4, padding: '2px 7px', cursor: addingBonusRowId === row.id ? 'default' : 'pointer', fontFamily: 'inherit', opacity: addingBonusRowId === row.id ? 0.5 : 1 }}
                                          >
                                            {addingBonusRowId === row.id ? 'Adding…' : `+ ${fmt2(bonusAmount)} bonus`}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>
                                    {isBonus ? '—' : fairLabel}
                                  </td>
                                  <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{isBonus ? '—' : fmt2(grossTotal)}</td>
                                  <td style={{ ...td, textAlign: 'right', fontSize: 12, color: hasShipping ? colors.charcoal : colors.lovelabMuted, fontWeight: hasShipping ? 600 : 400 }} title={hasShipping ? `Shipping deducted: ${fmt2(grossTotal - netTotal)}` : 'No shipping recorded — net = gross.'}>{isBonus ? '—' : fmt2(netTotal)}</td>
                                  <td style={{ ...td, textAlign: 'right', fontSize: 12, color: colors.lovelabMuted }}>{displayRate == null ? '—' : `${displayRate}%`}</td>
                                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal }}>{fmt2(row.commission_amount)}</td>
                                  <td style={td}>
                                    {canEditInvoice ? (
                                      <div>
                                        <input
                                          type="text"
                                          value={invoiceDrafts[row.id] ?? row.invoice_number ?? ''}
                                          placeholder="—"
                                          disabled={savingInvoiceId === row.id}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setInvoiceDrafts((prev) => ({ ...prev, [row.id]: value }));
                                            if (invoiceSaveState?.id === row.id) setInvoiceSaveState(null);
                                          }}
                                          onBlur={(e) => handleSaveInvoice(row.id, e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                          title="Type the matching invoice number and click away (or press Enter) to save."
                                          style={{ width: 100, fontSize: 11, padding: '3px 6px', border: `1px solid ${invoiceSaveState?.id === row.id && invoiceSaveState.kind === 'error' ? '#dc2626' : colors.lineGray}`, borderRadius: 4, fontFamily: 'inherit', color: colors.charcoal, background: savingInvoiceId === row.id ? '#f5f5f5' : '#fff' }}
                                        />
                                        {invoiceSaveState?.id === row.id && (
                                          <div role="status" style={{ marginTop: 2, fontSize: 9, color: invoiceSaveState.kind === 'success' ? '#16a34a' : '#dc2626' }}>
                                            {invoiceSaveState.message}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 11, color: colors.lovelabMuted }}>{row.invoice_number || '—'}</span>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: 'center' }}>
                                    {canToggle ? (
                                      <input
                                        type="checkbox"
                                        checked={isCustomerPaid}
                                        disabled={rowBusy}
                                        onChange={(e) => handleToggleCustomerPaid(row.id, e.target.checked)}
                                        title={isCustomerPaid ? 'Tick removes from next payout' : 'Tick when customer has paid the order'}
                                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: colors.inkPlum }}
                                      />
                                    ) : (
                                      <span style={{ fontSize: 11, color: colors.lovelabMuted }} title={isDerived ? 'Save the order to create a real commission row before you can tick this.' : isPaidOut ? 'Already paid out.' : isCancelled ? 'Cancelled.' : ''}>—</span>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: 'center' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: status.fg, background: status.bg, borderRadius: 12, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      {status.label}
                                    </span>
                                    {canToggle && (
                                      <div style={{ marginTop: 4 }}>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleReported(row.id, !isReported)}
                                          disabled={rowBusy}
                                          title={isReported
                                            ? `Take this line off ${reportsById[row.report_id]?.period_label || 'the report'} — it goes back in the pool and the next report picks it up again.`
                                            : lastReport
                                            ? `Put this line on the last report (${lastReport.period_label || lastReport.period_key}) by hand, as if it had been sent with it. Ticks Paid? if it isn't ticked yet.`
                                            : 'No report has been sent for this agent yet.'}
                                          style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, background: 'none', border: 'none', cursor: rowBusy ? 'default' : 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', opacity: rowBusy ? 0.5 : 1 }}
                                        >
                                          {isReported ? 'Not reported' : 'Mark reported'}
                                        </button>
                                      </div>
                                    )}
                                    {canForcePaid && (
                                      <div style={{ marginTop: 4 }}>
                                        <button
                                          type="button"
                                          onClick={() => handleForcePaid(row.id)}
                                          disabled={rowBusy}
                                          title="Move this line to Paid by hand — for when the agent was already paid but the line stayed on Reported. No payment is recorded, and Undo reverses it."
                                          style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: 'none', border: 'none', cursor: rowBusy ? 'default' : 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', opacity: rowBusy ? 0.5 : 1 }}
                                        >
                                          Force paid
                                        </button>
                                      </div>
                                    )}
                                    {isPaidOut && !!row.id && !String(row.id).startsWith('doc-') && (
                                      <div style={{ marginTop: 4 }}>
                                        <button
                                          type="button"
                                          onClick={() => handleRevertPaid(row.id)}
                                          disabled={rowBusy}
                                          title="Mark unpaid — returns to Ready to pay and re-enters the next payout"
                                          style={{ fontSize: 10, fontWeight: 700, color: colors.inkPlum, background: 'none', border: 'none', cursor: rowBusy ? 'default' : 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', opacity: rowBusy ? 0.5 : 1 }}
                                        >
                                          Undo
                                        </button>
                                      </div>
                                    )}
                                    {canDelete && (
                                      <div style={{ marginTop: 4 }}>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteCommission(row.id)}
                                          disabled={rowBusy}
                                          title="Delete this entry permanently"
                                          style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c', background: 'none', border: 'none', cursor: rowBusy ? 'default' : 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit', opacity: rowBusy ? 0.5 : 1 }}
                                        >
                                          {rowBusy ? '…' : 'Delete'}
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                        )}
                        <div style={{ padding: '10px 14px', borderTop: `1px solid ${colors.lineGray}`, fontSize: 11, color: colors.lovelabMuted, lineHeight: 1.5, background: '#fafafa' }}>
                          <strong style={{ color: colors.charcoal }}>Total</strong> = full invoice. <strong style={{ color: colors.charcoal }}>Net</strong> = Total − shipping. <strong style={{ color: colors.charcoal }}>Commission</strong> = Rate × Net. Tick <strong style={{ color: colors.charcoal }}>Paid?</strong> when the customer settles the order (→ <strong style={{ color: colors.charcoal }}>Ready</strong>). <strong style={{ color: colors.charcoal }}>Send report now</strong> emails Dionne (not the agent) and marks them <strong style={{ color: colors.charcoal }}>Reported</strong>. Then <strong style={{ color: colors.charcoal }}>Record Payment</strong> (pick the report + invoice) settles them as <strong style={{ color: colors.charcoal }}>Paid</strong>. If a line ended up on the wrong side of that, <strong style={{ color: colors.charcoal }}>Mark reported</strong> / <strong style={{ color: colors.charcoal }}>Not reported</strong> under the status moves it by hand, and <strong style={{ color: colors.charcoal }}>Force paid</strong> settles a line the agent was already paid for outside the app (<strong style={{ color: colors.charcoal }}>Undo</strong> reverses it).
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Payments */}
                <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>
                    Payments Ledger
                  </div>
                  {payments.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 13, color: colors.lovelabMuted }}>No payments recorded yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#faf8fc' }}>
                          <th style={th}>Date</th>
                          <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                          <th style={th}>Invoice #</th>
                          <th style={th}>Report</th>
                          <th style={th}>Notes</th>
                          <th style={{ ...th, textAlign: 'right', width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((row) => {
                          const isDeleting = deletingPaymentId === row.id;
                          const linkedReport = row.report_id ? reportsById[row.report_id] : null;
                          return (
                            <tr key={row.id}>
                              <td style={td}>{new Date(row.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: colors.charcoal }}>{fmt2(row.amount)}</td>
                              <td style={{ ...td, fontSize: 12 }}>{row.invoice_number || '—'}</td>
                              <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{linkedReport ? (linkedReport.period_label || linkedReport.period_key) : (row.report_id ? 'Report' : '—')}</td>
                              <td style={{ ...td, fontSize: 11, color: colors.lovelabMuted }}>{row.notes || '—'}</td>
                              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  onClick={() => openEditPayment(row)}
                                  aria-label="Edit payment"
                                  title="Edit"
                                  style={{ padding: '4px 8px', marginRight: 6, borderRadius: 6, border: `1px solid ${colors.lineGray}`, background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: fonts.body, color: colors.inkPlum }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(row)}
                                  disabled={isDeleting}
                                  aria-label="Delete payment"
                                  title="Delete"
                                  style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid #fecaca`, background: '#fff', cursor: isDeleting ? 'default' : 'pointer', fontSize: 11, fontFamily: fonts.body, color: '#b91c1c' }}
                                >
                                  {isDeleting ? '…' : 'Delete'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Reports — REMOVED (Phase 22, 2026-05-13). The
                CommissionReportsCard now renders inside the Financials tab
                above. Any old `?tab=reports` deep-links fall through to
                the default tab ('financials'). */}

            {activeTab === 'synalia' && agent && showSynaliaTab && (
              <SynaliaAgentTab
                agentId={agent.id}
                agentName={agent.full_name || agent.email}
                orgDocuments={orgDocuments}
                onChangeJewelerGroup={handleChangeJewelerGroup}
                togglingDocId={togglingSynaliaDocId}
              />
            )}

            {/* ── Tab: Consignment ──────────────────────────────────────────── */}
            {activeTab === 'consignment' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.lineGray}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>Consignment Orders</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {activeConsignment.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f3f4f6', borderRadius: 20, padding: '2px 9px' }}>
                        {activeConsignment.length} active
                      </span>
                    )}
                    {agentConsignmentOrders.filter(d => {
                      const rd = d.metadata?.consignment?.return_date;
                      return rd && !d.metadata?.consignment?.returned_at && new Date(rd) < new Date();
                    }).length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '2px 9px' }}>overdue</span>
                    )}
                  </div>
                </div>
                {agentConsignmentOrders.length === 0 ? (
                  <div style={{ padding: 24, fontSize: 13, color: colors.lovelabMuted }}>No consignment orders assigned to this agent.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#faf8fc' }}>
                        {['Date', 'Recipient', 'Amount', 'Return Date', 'Status'].map(h => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agentConsignmentOrders.map(o => {
                        const c = o.metadata?.consignment || {};
                        const isRet = !!c.returned_at;
                        const isOvd = !isRet && c.return_date && new Date(c.return_date) < new Date();
                        const days = c.return_date && !isRet
                          ? Math.ceil((new Date(c.return_date) - new Date()) / 86400000)
                          : null;
                        return (
                          <tr key={o.id}>
                            <td style={td}>{o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={td}>
                              <div style={{ fontWeight: 600 }}>{c.recipient_name || o.client_name || '—'}</div>
                              {(c.recipient_company || o.client_company) && <div style={{ fontSize: 11, color: '#aaa' }}>{c.recipient_company || o.client_company}</div>}
                            </td>
                            <td style={{ ...td, fontWeight: 700 }}>{o.total_amount != null ? fmt2(o.total_amount) : '—'}</td>
                            <td style={td}>
                              {c.return_date ? (
                                <>
                                  <div style={{ fontWeight: 600, color: isOvd ? '#dc2626' : '#333' }}>
                                    {new Date(c.return_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                  {days !== null && (
                                    <div style={{ fontSize: 10, fontWeight: 700, color: days < 0 ? '#dc2626' : days <= 7 ? '#d97706' : '#aaa' }}>
                                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={td}>
                              {isRet
                                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>Returned</span>
                                : isOvd
                                  ? <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 20, padding: '2px 8px' }}>Overdue</span>
                                  : <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f0fdf4', borderRadius: 20, padding: '2px 8px' }}>Active</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Tab: Organisation ─────────────────────────────────────────── */}
            {activeTab === 'organisation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {agent?.organization_id && orgData ? (
                  <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum }}>{orgData.name}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: colors.lovelabMuted }}>
                          Shared settings and team settlement live on the organization page.
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/admin/organizations/${agent.organization_id}`)}
                        style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${colors.inkPlum}`, background: '#fff', color: colors.inkPlum, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                      >
                        Open organization
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 20, fontSize: 12, color: colors.charcoal, flexWrap: 'wrap', paddingTop: 14, borderTop: `1px solid ${colors.lineGray}` }}>
                      <span>Territory: <strong>{orgData.territory || 'Not set'}</strong></span>
                      <span>Default rate: <strong>{Number(orgData.commission_rate) || 0}%</strong></span>
                      <span>Members: <strong>{organizationMembers.length}</strong></span>
                    </div>
                    {orgData.conditions && (
                      <div style={{ marginTop: 10, fontSize: 11, color: colors.lovelabMuted }}>
                        {orgData.conditions}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`, fontSize: 13, color: colors.lovelabMuted }}>
                    No organisation linked to this agent.
                  </div>
                )}

                {/* Team members */}
                {agent?.organization_id && (
                  <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum, marginBottom: 12 }}>Team Members</div>
                    <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="email"
                        placeholder="colleague@company.com"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button type="submit" disabled={addingMember || !memberEmail.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: addingMember ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                        {addingMember ? 'Adding...' : 'Add'}
                      </button>
                    </form>
                    {organizationMembers.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#faf8fc' }}>
                            <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizationMembers.map((m) => (
                            <tr key={m.id}>
                              <td style={td}>{m.profiles?.full_name || '—'}</td>
                              <td style={td}>{m.profiles?.email || '—'}</td>
                              <td style={td}>{m.role}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Documents ────────────────────────────────────────────── */}
            {activeTab === 'documents' && (
              <div style={{ background: '#fff', border: `1px solid ${colors.lineGray}`, borderRadius: 12, padding: 20 }}>
                <AgentFolderBrowser agentId={agentId} organizationId={agent?.organization_id} orderDocuments={organizationFolderDocuments} />
              </div>
            )}

            {/* ── Payment Modal ─────────────────────────────────────────────── */}
            {showPaymentModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#fff', padding: 24, borderRadius: 14, width: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', fontFamily: fonts.body }}>
                  <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: colors.inkPlum }}>
                    {editingPayment ? 'Edit Payment' : 'Record Payment'}
                  </h3>
                  <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {!editingPayment && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Commission report (optional)</label>
                        <select
                          value={paymentReportId}
                          onChange={e => handleSelectPaymentReport(e.target.value)}
                          style={inputStyle}
                        >
                          <option value="">— No report (plain payment) —</option>
                          {reports.map((r) => {
                            const isPaid = paidReportIds.has(r.id);
                            return (
                              <option key={r.id} value={r.id} disabled={isPaid}>
                                {(r.period_label || r.period_key)} · {fmt2(r.total_due)}{isPaid ? ' (already paid)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        {paymentReportId && (
                          <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 4 }}>
                            Saving marks every order in this report as paid and stamps the invoice number below on each.
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Date</label>
                      <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Amount (€)</label>
                      <input type="text" inputMode="decimal" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0,00" required style={inputStyle} />
                    </div>
                    {!editingPayment && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Invoice number (optional)</label>
                        <input type="text" value={paymentInvoice} onChange={e => setPaymentInvoice(e.target.value)} placeholder="e.g. INV-2026-042" style={inputStyle} />
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: colors.lovelabMuted, marginBottom: 4 }}>Notes (optional)</label>
                      <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. bank transfer" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" onClick={closePaymentModal} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${colors.lineGray}`, background: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: fonts.body }}>Cancel</button>
                      <button type="submit" disabled={savingPayment} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: colors.inkPlum, color: '#fff', cursor: savingPayment ? 'default' : 'pointer', fontWeight: 700, fontFamily: fonts.body }}>
                        {savingPayment ? 'Saving...' : (editingPayment ? 'Save Changes' : 'Save Payment')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {showQuickOrderModal && agent && (
              <AddQuickOrderModal
                agent={agent}
                onClose={() => setShowQuickOrderModal(false)}
                onSuccess={() => { setShowQuickOrderModal(false); load(); }}
              />
            )}

            {showBonusModal && agent && (
              <AddBonusModal
                agent={agent}
                onClose={() => setShowBonusModal(false)}
                onSuccess={() => { setShowBonusModal(false); load(); }}
              />
            )}

            {showNewClientBonusModal && agent && (
              <NewClientBonusModal
                agent={agent}
                onClose={() => setShowNewClientBonusModal(false)}
                onSuccess={() => { setShowNewClientBonusModal(false); load(); }}
              />
            )}
          </>
        )}
      </div>

      <ContractChatPanel
        isOpen={contractChatOpen}
        onClose={() => setContractChatOpen(false)}
        agentId={agentId}
        agentName={agent?.full_name || agent?.email}
      />
    </div>
  );
}

// Classify a commission row into a single status bucket. Mirrors the status
// pill logic so the filter chips and the pills always agree.
function commissionStatusKey(row) {
  if (!row) return 'awaiting';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'paid') return 'paid';
  if (row.report_id) return 'reported';
  if (row.customer_paid_at) return 'ready';
  return 'awaiting';
}

const COMMISSION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'ready', label: 'Ready' },
  { key: 'reported', label: 'Reported' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];

const th = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: colors.lovelabMuted,
  textTransform: 'uppercase',
  textAlign: 'left',
  borderBottom: `1px solid ${colors.lineGray}`,
};

const td = {
  padding: '10px 12px',
  fontSize: 13,
  color: colors.charcoal,
  borderBottom: `1px solid ${colors.lineGray}`,
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${colors.lineGray}`,
  fontSize: 14,
  fontFamily: fonts.body,
  boxSizing: 'border-box'
};
