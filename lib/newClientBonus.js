/**
 * New-Client Bonus helpers (Phase 19).
 *
 * Per-agent flat-EUR bonus that fires the first time the agent brings
 * in a given customer. Wired into:
 *   - lib/commissionAttribution.js (forward-going, on every order save)
 *   - app/api/admin/agents/[id]/new-client-bonus/* (toggle + retroactive backfill)
 *
 * Bonus rows live in agent_commissions with type='new_client_bonus' and
 * follow the same pending → paid lifecycle as ordinary order commissions.
 *
 * "Same customer" = same FUZZY-NORMALIZED company name. We strip common
 * legal-entity tokens (SAS, SARL, BV, ...), accent-fold, lowercase, trim,
 * collapse whitespace. So "SAS Little Factory" and "Little Factory" map
 * to the same key and only trigger one bonus.
 *
 * Since the mode split (see the 20260812120000 migration) the bonus is
 * only created automatically in 'auto'. In 'manual' the admin adds it
 * per order from the commission table via createManualBonusForOrder.
 */

// Note: dots are stripped from the input BEFORE this regex runs (see
// normalizeCustomerName), so we only list the dotless forms here.
const LEGAL_ENTITY_TOKENS = [
  // French
  'sas', 'sasu', 'sarl', 'sa', 'sca', 'snc', 'eurl', 'sci', 'sct',
  // Belgian / Dutch
  'bv', 'bvba', 'nv', 'cvba',
  // German / Austrian / Swiss
  'gmbh', 'ag', 'kg', 'ohg', 'gesmbh',
  // Italian
  'srl', 'spa',
  // English
  'ltd', 'limited', 'llc', 'lp', 'llp', 'inc', 'incorporated', 'corp', 'corporation', 'co',
  // Generic
  'group', 'groupe', 'holding',
];

// Built once: matches " sas ", " sarl ", " gmbh " etc. as surrounded-by-
// whitespace tokens. We pad the input with leading/trailing spaces
// before applying this so first/last tokens also match.
const TOKEN_RE = new RegExp(
  '\\s(?:' + LEGAL_ENTITY_TOKENS.join('|') + ')\\s',
  'gi',
);

export const BONUS_MODE_OFF = 'off';
export const BONUS_MODE_MANUAL = 'manual';
export const BONUS_MODE_AUTO = 'auto';

export const BONUS_MODES = [BONUS_MODE_OFF, BONUS_MODE_MANUAL, BONUS_MODE_AUTO];

/**
 * Read the bonus mode off a profile.
 *
 * Profiles written before the mode column existed (and the trimmed
 * profile objects some callers pass around) only carry the old boolean,
 * so fall back to it: enabled meant "create automatically".
 *
 * @param {{ new_client_bonus_mode?: string, new_client_bonus_enabled?: boolean }} profile
 * @returns {'off'|'manual'|'auto'}
 */
export function resolveBonusMode(profile) {
  const raw = profile?.new_client_bonus_mode;
  if (BONUS_MODES.includes(raw)) return raw;
  return profile?.new_client_bonus_enabled ? BONUS_MODE_AUTO : BONUS_MODE_OFF;
}

/**
 * Fuzzy-normalize a customer name for cross-document grouping.
 *
 *   normalizeCustomerName('SAS Little Factory')   → 'little factory'
 *   normalizeCustomerName('S.A.R.L. Casadona')    → 'casadona'
 *   normalizeCustomerName('Smile Genève')         → 'smile geneve'
 *   normalizeCustomerName(null)                   → ''
 *
 * Rules:
 *   1. Strip diacritics (é → e, ñ → n).
 *   2. Lowercase.
 *   3. Collapse runs of whitespace + add leading/trailing spaces (so
 *      first/last token matches).
 *   4. Strip legal-entity tokens (SAS, SARL, Ltd, ...).
 *   5. Drop ampersands and hyphens (visually noisy, not identifying).
 *   6. Trim and collapse whitespace again.
 */
export function normalizeCustomerName(raw) {
  if (raw == null) return '';
  let s = String(raw);
  if (!s.trim()) return '';

  // 1. Diacritics
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Lowercase
  s = s.toLowerCase();

  // 3. Drop dots so "S.A.R.L." becomes "sarl" (the regex below expects
  //    contiguous letters separated by whitespace, not by punctuation).
  s = s.replace(/\./g, '');

  // 4. Pad + collapse whitespace
  s = ' ' + s.replace(/\s+/g, ' ').trim() + ' ';

  // 5. Strip legal entity tokens — repeat until stable to handle stacks
  //    like " sas sarl casadona " → " casadona ".
  let prev;
  do {
    prev = s;
    s = s.replace(TOKEN_RE, ' ');
  } while (s !== prev);

  // 6. Drop & and -
  s = s.replace(/[&\-]/g, ' ');

  // 7. Final trim + collapse
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Pull the customer key for a document. Prefer client_company; fall
 * back to client_name for documents that only had the contact filled.
 * Both are run through normalizeCustomerName.
 */
export function customerKeyForDocument(document) {
  if (!document) return '';
  const company = normalizeCustomerName(document.client_company);
  if (company) return company;
  return normalizeCustomerName(document.client_name);
}

/**
 * Check whether the given document represents the agent's FIRST order
 * for that customer (fuzzy-matched). Looks at all of the agent's
 * non-cancelled commissions linked to non-deleted documents, computes
 * each customer key, and returns true iff no earlier (created_at <
 * document.created_at) commission has the same key.
 *
 * @param {object} adminSupabase  Service-role Supabase client.
 * @param {string} agentId
 * @param {{ id: string, client_company?: string, client_name?: string, created_at: string }} document
 * @returns {Promise<boolean>}
 */
export async function isFirstOrderForCustomer(adminSupabase, agentId, document) {
  if (!agentId || !document?.id || !document?.created_at) return false;
  const key = customerKeyForDocument(document);
  if (!key) return false;

  // Fetch all this agent's non-cancelled order commissions whose linked
  // documents are not deleted, with the company/name pair we need to
  // recompute the key. (We do client-side normalization because Postgres
  // can't replicate our token-strip rules cheaply.)
  const { data: rows, error } = await adminSupabase
    .from('agent_commissions')
    .select(
      'id, document_id, created_at, type, status, ' +
      'documents!inner(id, client_company, client_name, deleted_at, created_at)',
    )
    .eq('agent_id', agentId)
    .neq('status', 'cancelled')
    .in('type', ['order', 'new_client_bonus'])
    .order('created_at', { ascending: true });
  if (error) {
    const enriched = new Error(error.message || 'isFirstOrderForCustomer query failed');
    enriched.code = error.code || null;
    throw enriched;
  }

  const docCreatedAt = new Date(document.created_at).getTime();

  for (const row of rows || []) {
    const linked = row.documents;
    if (!linked) continue;
    if (linked.deleted_at) continue;
    if (linked.id === document.id) continue;
    const linkedCreatedAt = new Date(linked.created_at).getTime();
    if (Number.isFinite(linkedCreatedAt) && linkedCreatedAt >= docCreatedAt) continue;
    const linkedKey = customerKeyForDocument(linked);
    if (linkedKey && linkedKey === key) {
      return false;
    }
  }

  return true;
}

/**
 * Build the preview rows shown in the "Enable bonus?" modal. Walks the
 * agent's full non-cancelled / non-deleted order history, picks the
 * earliest order per fuzzy-normalized customer, and returns an array
 * sorted oldest-first.
 *
 * Honours bonusAmount only for the `total` calculation in the response;
 * does NOT touch the database.
 *
 * @returns {Promise<{ rows: Array<{customer, customer_key, first_order_date, document_id, amount}>, total: number, customer_count: number }>}
 */
export async function previewBackfill(adminSupabase, agentId, bonusAmount) {
  if (!agentId) return { rows: [], total: 0, customer_count: 0 };
  const amt = Number(bonusAmount) || 0;

  // Pull every order doc for this agent (created_by) AND every document
  // already linked via an existing commission row (covers org / event-creator
  // attribution). De-duplicate by document.id afterwards.
  const [{ data: directDocs, error: directErr }, { data: viaCommissions, error: commErr }] =
    await Promise.all([
      adminSupabase
        .from('documents')
        .select('id, client_company, client_name, created_at, document_type, deleted_at, total_amount')
        .eq('created_by', agentId)
        .is('deleted_at', null)
        .eq('document_type', 'order')
        .neq('order_channel', 'sample')
        .order('created_at', { ascending: true }),
      adminSupabase
        .from('agent_commissions')
        .select(
          'document_id, created_at, type, status, ' +
          'documents!inner(id, client_company, client_name, created_at, document_type, deleted_at, total_amount)',
        )
        .eq('agent_id', agentId)
        .eq('type', 'order')
        .neq('status', 'cancelled'),
    ]);

  if (directErr) throw new Error(directErr.message || 'previewBackfill direct fetch failed');
  if (commErr) throw new Error(commErr.message || 'previewBackfill commissions fetch failed');

  const seen = new Set();
  const allDocs = [];
  for (const d of directDocs || []) {
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    allDocs.push(d);
  }
  for (const c of viaCommissions || []) {
    const d = c?.documents;
    if (!d || d.deleted_at || d.document_type !== 'order') continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    allDocs.push(d);
  }

  // Sort all docs oldest-first so the FIRST one we encounter for each
  // customer key wins.
  allDocs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Find existing bonus rows so we never propose duplicates in the preview.
  const { data: existingBonuses, error: bonusErr } = await adminSupabase
    .from('agent_commissions')
    .select('document_id')
    .eq('agent_id', agentId)
    .eq('type', 'new_client_bonus')
    .neq('status', 'cancelled');
  if (bonusErr) throw new Error(bonusErr.message || 'previewBackfill bonus fetch failed');
  const existingBonusDocIds = new Set((existingBonuses || []).map((r) => r.document_id));

  const customerToFirstDoc = new Map();
  for (const d of allDocs) {
    const key = customerKeyForDocument(d);
    if (!key) continue;
    if (!customerToFirstDoc.has(key)) {
      customerToFirstDoc.set(key, d);
    }
  }

  const rows = [];
  for (const [key, doc] of customerToFirstDoc) {
    if (existingBonusDocIds.has(doc.id)) continue;
    rows.push({
      customer: doc.client_company || doc.client_name || '',
      customer_key: key,
      first_order_date: doc.created_at,
      document_id: doc.id,
      amount: amt,
    });
  }

  // Stable order — oldest first.
  rows.sort((a, b) => new Date(a.first_order_date) - new Date(b.first_order_date));

  return {
    rows,
    customer_count: rows.length,
    total: Math.round(rows.length * amt * 100) / 100,
  };
}

/**
 * Persist one new_client_bonus row per distinct customer the agent has
 * historically brought in but doesn't yet have a bonus row for.
 *
 * Idempotent: re-running with the same agent + amount is a no-op (the
 * existing-bonus filter inside previewBackfill handles dedup).
 *
 * @returns {Promise<{ created: number, total: number, rows: Array }>}
 */
export async function executeBackfill(adminSupabase, agentId, bonusAmount) {
  if (!agentId) return { created: 0, total: 0, rows: [] };
  const amt = Number(bonusAmount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { created: 0, total: 0, rows: [] };
  }

  const { rows } = await previewBackfill(adminSupabase, agentId, amt);
  if (rows.length === 0) return { created: 0, total: 0, rows: [] };

  const inserts = rows.map((r) => ({
    agent_id: agentId,
    document_id: r.document_id,
    type: 'new_client_bonus',
    order_total: 0,
    commission_rate: 0,
    commission_amount: amt,
    status: 'pending',
    notes: `New client: ${r.customer || '(unknown)'} — auto-detected (retroactive)`,
    created_at: r.first_order_date,
  }));

  const { data: created, error } = await adminSupabase
    .from('agent_commissions')
    .insert(inserts)
    .select('id, document_id, created_at, commission_amount');

  if (error) {
    const enriched = new Error(error.message || 'executeBackfill insert failed');
    enriched.code = error.code || null;
    throw enriched;
  }

  return {
    created: created?.length || 0,
    total: Math.round((created?.length || 0) * amt * 100) / 100,
    rows: created || [],
  };
}

/**
 * Shared body of the automatic and manual bonus paths. Both must apply
 * exactly the same "is this really a new customer" rules — the only
 * difference is who decided (the mode gate, and the note we leave).
 *
 * @returns {Promise<{ created: true, amount: number } | { skipped: true, reason: string }>}
 */
async function insertBonusForDocument(adminSupabase, { agentId, amount, document, origin }) {
  // Re-fetch the document with timestamps so we can ask isFirstOrderForCustomer.
  let docForCheck = document;
  if (!document.created_at) {
    const { data: d } = await adminSupabase
      .from('documents')
      .select('id, client_company, client_name, created_at, deleted_at')
      .eq('id', document.id)
      .maybeSingle();
    if (!d) return { skipped: true, reason: 'document_not_found' };
    if (d.deleted_at) return { skipped: true, reason: 'document_deleted' };
    docForCheck = d;
  }

  const customerKey = customerKeyForDocument(docForCheck);
  if (!customerKey) {
    return { skipped: true, reason: 'no_customer_key' };
  }

  // Idempotency: bail if a bonus already exists for (agent, document).
  const { data: existing } = await adminSupabase
    .from('agent_commissions')
    .select('id')
    .eq('agent_id', agentId)
    .eq('document_id', document.id)
    .eq('type', 'new_client_bonus')
    .maybeSingle();
  if (existing) {
    return { skipped: true, reason: 'already_exists' };
  }

  const isFirst = await isFirstOrderForCustomer(adminSupabase, agentId, docForCheck);
  if (!isFirst) {
    return { skipped: true, reason: 'not_first_order' };
  }

  const { error } = await adminSupabase.from('agent_commissions').insert({
    agent_id: agentId,
    document_id: document.id,
    type: 'new_client_bonus',
    order_total: 0,
    commission_rate: 0,
    commission_amount: amount,
    status: 'pending',
    notes: `New client: ${docForCheck.client_company || docForCheck.client_name || '(unknown)'} — ${origin}`,
  });

  if (error) {
    const enriched = new Error(error.message || 'new client bonus insert failed');
    enriched.code = error.code || null;
    throw enriched;
  }

  return { created: true, amount };
}

/**
 * Forward-going hook called from the document POST/PUT routes after an
 * order commission is upserted. Creates a single new_client_bonus row
 * if and only if:
 *   - the agent's bonus mode is 'auto' (NOT 'manual' — there the admin
 *     decides per order and nothing may be created behind their back)
 *   - profile.new_client_bonus_amount > 0
 *   - this is the agent's first non-cancelled order for the customer
 *   - no new_client_bonus row already exists for this (agent, document)
 *
 * Errors are NOT swallowed: the caller wraps this in the same
 * recordHealthEvent pattern as the order commission so failures surface
 * in system_health_events instead of silently disappearing.
 *
 * @returns {Promise<{ created: true, amount: number } | { skipped: true, reason: string }>}
 */
export async function maybeCreateBonusForOrder(adminSupabase, { agentId, profile, document }) {
  if (!agentId || !profile || !document?.id) {
    return { skipped: true, reason: 'missing_inputs' };
  }
  const mode = resolveBonusMode(profile);
  if (mode === BONUS_MODE_OFF) {
    return { skipped: true, reason: 'feature_disabled' };
  }
  if (mode === BONUS_MODE_MANUAL) {
    return { skipped: true, reason: 'manual_mode' };
  }
  const amt = Number(profile.new_client_bonus_amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { skipped: true, reason: 'no_amount' };
  }

  return insertBonusForDocument(adminSupabase, {
    agentId,
    amount: amt,
    document,
    origin: 'auto-detected',
  });
}

/**
 * Manual path: the admin decided THIS new client is worth the bonus and
 * clicked the button on the order row. Applies every rule the automatic
 * path applies except the 'auto' mode gate, plus one extra: the bonus
 * must hang off an order commission that actually exists, so it can
 * never be attached to a document this agent was never credited for.
 *
 * The eligibility shown in the UI is computed from the rows loaded in
 * the browser, which can be a partial page — this server-side check is
 * what actually guarantees one bonus per customer.
 *
 * @returns {Promise<{ created: true, amount: number } | { skipped: true, reason: string }>}
 */
export async function createManualBonusForOrder(adminSupabase, { agentId, profile, documentId }) {
  if (!agentId || !profile || !documentId) {
    return { skipped: true, reason: 'missing_inputs' };
  }
  if (resolveBonusMode(profile) === BONUS_MODE_OFF) {
    return { skipped: true, reason: 'feature_disabled' };
  }
  const amt = Number(profile.new_client_bonus_amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { skipped: true, reason: 'no_amount' };
  }

  const { data: orderRow, error: orderErr } = await adminSupabase
    .from('agent_commissions')
    .select('id')
    .eq('agent_id', agentId)
    .eq('document_id', documentId)
    .eq('type', 'order')
    .neq('status', 'cancelled')
    .maybeSingle();
  if (orderErr) {
    const enriched = new Error(orderErr.message || 'order commission lookup failed');
    enriched.code = orderErr.code || null;
    throw enriched;
  }
  if (!orderRow) {
    return { skipped: true, reason: 'no_order_commission' };
  }

  return insertBonusForDocument(adminSupabase, {
    agentId,
    amount: amt,
    document: { id: documentId },
    origin: 'added by admin',
  });
}
