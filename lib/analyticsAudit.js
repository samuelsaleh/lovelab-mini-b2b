/**
 * Analytics accuracy audit — pure aggregation, no I/O.
 *
 * Answers "can I trust the numbers on /analytics?" by recomputing what the
 * dashboard shows and reporting the places where a number is a floor, an
 * estimate, or silently incomplete. Every check reuses the SAME helpers the
 * dashboard renders with (lib/vitrines, lib/collectionMatch, lib/countries),
 * so this file cannot drift into auditing logic that no longer ships.
 *
 * Driven by scripts/diagnose-channel-analytics.mjs against the live database.
 *
 * Status vocabulary:
 *   ok    - verified, nothing to explain
 *   info  - expected by design, worth knowing when reading the chart
 *   warn  - a number on screen is a floor / estimate / partially blind
 *   fail  - the data itself is inconsistent
 */

import { EXCLUDED_ORDER_CHANNELS } from './organizations/teamStats.js';
import { resolveVitrineDetail } from './vitrines.js';
import { isKnownCollection, matchCollectionLabel } from './collectionMatch.js';
import { normalizeCountry } from './countries.js';

// DocumentsPanel.fetchFolderDocs asks for one page of this size and never
// paginates, so a folder at or above the cap is silently truncated in the
// folder view and in its analytics header.
export const FOLDER_FETCH_LIMIT = 200;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const amount = (d) => Number(d?.total_amount) || 0;
const isOrder = (d) => d?.document_type === 'order';
const isQuote = (d) => d?.document_type === 'quote';

const eur = (n) => `EUR ${round2(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sumAmount(docs) {
  return round2(docs.reduce((s, d) => s + amount(d), 0));
}

function check(id, title, status, headline, details = [], data = {}) {
  return { id, title, status, headline, details, data };
}

/**
 * The document set every analytics number is built from.
 * Mirrors AnalyticsDashboard.loadAnalytics + its `docs` memo:
 *   - trashed rows dropped (the API does this server-side)
 *   - drafts / parked orders dropped
 *   - non-revenue channels dropped (internal, consignment, write-off, sample)
 *   - deduped by id
 */
export function analyticsBaseDocs(documents = []) {
  const byId = new Map();
  for (const d of documents) {
    if (!d) continue;
    if (d.deleted_at) continue;
    if (d.status === 'draft') continue;
    if (EXCLUDED_ORDER_CHANNELS.includes(d.order_channel)) continue;
    byId.set(d.id ?? Symbol('anon'), d);
  }
  return [...byId.values()];
}

/**
 * 1. Do the Documents-panel header and the analytics KPI agree?
 * The panel sums every non-draft document; the KPI sums orders only. They
 * match exactly as long as no quote exists.
 */
export function checkHeadlineReconciliation(base) {
  const orders = base.filter(isOrder);
  const quotes = base.filter(isQuote);
  const panelTotal = sumAmount(base);
  const kpiRevenue = sumAmount(orders);
  const delta = round2(panelTotal - kpiRevenue);

  const data = {
    panelTotal, kpiRevenue, delta,
    documents: base.length, orders: orders.length, quotes: quotes.length,
    quoteValue: sumAmount(quotes),
  };

  if (delta === 0) {
    return check(
      'headline', 'Documents header vs analytics KPI', 'ok',
      `Both report ${eur(kpiRevenue)} across ${base.length} documents (${orders.length} orders, no quotes).`,
      [], data,
    );
  }
  return check(
    'headline', 'Documents header vs analytics KPI', 'warn',
    `The two headline totals differ by ${eur(delta)}.`,
    [
      `Documents panel header: ${eur(panelTotal)} (every non-draft document)`,
      `Analytics Total Revenue: ${eur(kpiRevenue)} (orders only)`,
      `${quotes.length} quote(s) worth ${eur(data.quoteValue)} are the difference. Neither number is wrong; they measure different things.`,
    ],
    data,
  );
}

/**
 * 2. "Revenue per Fair" buckets by event_id with no filter on event type, so
 * agent folders, partner folders and "No Event" appear alongside real fairs.
 * Revenue parked outside a fair means every fair bar is a floor.
 */
export function checkFairAttribution(base, events = []) {
  const typeById = new Map(events.map((e) => [e.id, (e.type || 'other')]));
  const nameById = new Map(events.map((e) => [e.id, e.name]));
  const orders = base.filter(isOrder);

  const buckets = new Map();
  const perFolder = new Map();
  for (const d of orders) {
    const type = d.event_id ? (typeById.get(d.event_id) || 'unknown') : 'none';
    buckets.set(type, round2((buckets.get(type) || 0) + amount(d)));

    const key = d.event_id || '__none__';
    if (!perFolder.has(key)) {
      perFolder.set(key, {
        name: d.event_id ? (nameById.get(d.event_id) || 'Unknown folder') : 'No Event',
        type, revenue: 0, orders: 0,
      });
    }
    const entry = perFolder.get(key);
    entry.revenue = round2(entry.revenue + amount(d));
    entry.orders++;
  }

  const fairRevenue = buckets.get('fair') || 0;
  const total = sumAmount(orders);
  const offFair = round2(total - fairRevenue);
  const folders = [...perFolder.values()].sort((a, b) => b.revenue - a.revenue);
  const data = { total, fairRevenue, offFair, byType: Object.fromEntries(buckets), folders };

  if (offFair === 0) {
    return check(
      'fair-attribution', 'Revenue per Fair — is it really per fair?', 'ok',
      `All ${eur(total)} of order revenue sits in a fair folder.`,
      [], data,
    );
  }

  const details = [
    `${eur(fairRevenue)} is in real fairs (event type "fair").`,
    `${eur(offFair)} is NOT, but still shows in the "Revenue per Fair" chart:`,
    ...folders
      .filter((f) => f.type !== 'fair')
      .slice(0, 12)
      .map((f) => `   ${f.name} [${f.type}] — ${eur(f.revenue)} over ${f.orders} order(s)`),
    'A fair order filed into an agent folder counts for the agent, not the fair, so each fair bar is a floor.',
  ];
  return check(
    'fair-attribution', 'Revenue per Fair — is it really per fair?', 'warn',
    `${eur(offFair)} of ${eur(total)} (${Math.round((offFair / (total || 1)) * 100)}%) is not attributed to a fair.`,
    details, data,
  );
}

/**
 * 3. "Revenue per Agent" hides the no-agent bucket, so its bars never sum to
 * Total Revenue. Older documents predate the agent_id column entirely.
 */
export function checkAgentCoverage(base) {
  const orders = base.filter(isOrder);
  const withAgent = orders.filter((d) => d.agent_id);
  const without = orders.filter((d) => !d.agent_id);
  const hidden = sumAmount(without);
  const data = {
    orders: orders.length,
    withAgent: withAgent.length,
    withoutAgent: without.length,
    chartedRevenue: sumAmount(withAgent),
    hiddenRevenue: hidden,
  };

  if (without.length === 0) {
    return check(
      'agent-coverage', 'Revenue per Agent — completeness', 'ok',
      `Every one of the ${orders.length} orders carries a selling agent.`,
      [], data,
    );
  }
  return check(
    'agent-coverage', 'Revenue per Agent — completeness', 'warn',
    `${without.length} of ${orders.length} orders have no agent, hiding ${eur(hidden)} from the chart.`,
    [
      `Charted: ${eur(data.chartedRevenue)}`,
      `Hidden in the dropped "No agent" bucket: ${eur(hidden)}`,
      'Read the chart as a ranking of agents, not as a breakdown of total revenue.',
    ],
    data,
  );
}

/**
 * 4. Top Products / Quick Stats only see rows whose collection still matches
 * the catalogue. Everything else is silently invisible.
 */
export function checkCollectionCoverage(base) {
  let rows = 0;
  let named = 0;
  let exact = 0;
  let substringOnly = 0;
  const unknown = new Map();

  for (const d of base) {
    for (const r of (d?.metadata?.formState?.rows || [])) {
      rows++;
      const raw = String(r?.collection || '').trim();
      if (!raw) continue;
      named++;
      const qty = parseInt(String(r?.quantity || '').replace(/[^\d.-]/g, ''), 10) || 0;
      if (isKnownCollection(raw)) { exact++; continue; }
      if (matchCollectionLabel(raw)) { substringOnly++; continue; }
      const entry = unknown.get(raw) || { name: raw, rows: 0, qty: 0 };
      entry.rows++;
      entry.qty += qty;
      unknown.set(raw, entry);
    }
  }

  const unknownList = [...unknown.values()].sort((a, b) => b.rows - a.rows);
  const unknownRows = unknownList.reduce((s, u) => s + u.rows, 0);
  const data = { rows, named, exact, substringOnly, unknownRows, unknown: unknownList };

  if (unknownRows === 0 && substringOnly === 0) {
    return check(
      'collection-coverage', 'Top Products / Quick Stats — catalogue coverage', 'ok',
      `All ${named} named order lines match the catalogue exactly.`,
      [], data,
    );
  }

  const details = [];
  if (substringOnly > 0) {
    details.push(
      `${substringOnly} line(s) match only by substring: counted in Top Products but DROPPED from Quick Stats (carat / shape / size / cord).`,
    );
  }
  if (unknownRows > 0) {
    details.push(`${unknownRows} line(s) match nothing and are invisible in both panels:`);
    details.push(...unknownList.slice(0, 12).map((u) => `   "${u.name}" — ${u.rows} line(s), ${u.qty} piece(s)`));
  }
  return check(
    'collection-coverage', 'Top Products / Quick Stats — catalogue coverage', unknownRows > 0 ? 'warn' : 'info',
    `${exact} of ${named} named lines match exactly; ${substringOnly} by substring, ${unknownRows} not at all.`,
    details, data,
  );
}

/**
 * 5. Quick Stats groups carat / shape / size / cord by the RAW string, so
 * "1.00" and "1.0" become two rows for the same thing.
 */
export function checkAttributeBuckets(base) {
  const fields = [
    { key: 'carat', label: 'Carat Breakdown', canon: (v) => {
      const n = Number(String(v).replace(/[^\d.]/g, ''));
      return Number.isFinite(n) && n > 0 ? String(n) : String(v).trim().toLowerCase();
    } },
    { key: 'shape', label: 'Top Shapes', canon: (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ') },
    { key: 'size', label: 'Sizes', canon: (v) => String(v).trim().toLowerCase().replace(/[\s,]+/g, '') },
    { key: 'colorCord', label: 'Cord Colors', canon: (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ') },
  ];

  const splits = [];
  for (const field of fields) {
    const groups = new Map();
    for (const d of base) {
      for (const r of (d?.metadata?.formState?.rows || [])) {
        if (!isKnownCollection(r?.collection)) continue;
        const raw = String(r?.[field.key] || '').trim();
        if (!raw) continue;
        const canonKey = field.canon(raw);
        if (!groups.has(canonKey)) groups.set(canonKey, new Set());
        groups.get(canonKey).add(raw);
      }
    }
    for (const [canonKey, variants] of groups) {
      if (variants.size > 1) {
        splits.push({ panel: field.label, canonical: canonKey, variants: [...variants] });
      }
    }
  }

  const data = { splits };
  if (splits.length === 0) {
    return check(
      'attribute-buckets', 'Quick Stats — duplicate buckets', 'ok',
      'No carat / shape / size / cord value is split across spelling variants.',
      [], data,
    );
  }
  return check(
    'attribute-buckets', 'Quick Stats — duplicate buckets', 'warn',
    `${splits.length} value(s) are split into more than one row for the same thing.`,
    splits.slice(0, 15).map((s) => `${s.panel}: ${s.variants.map((v) => `"${v}"`).join(' + ')} are all "${s.canonical}"`),
    data,
  );
}

/**
 * 6. The Vitrines KPI is part toggle, part regex over free-text remarks, with
 * implausible values rewritten to 1.
 */
export function checkVitrines(base) {
  let totalQty = 0;
  const fromToggle = [];
  const fromRemarks = [];
  const clamped = [];

  for (const d of base) {
    const detail = resolveVitrineDetail(d);
    if (!detail.qty) continue;
    totalQty += detail.qty;
    const who = d.client_company || d.client_name || 'Unknown';
    if (detail.source === 'toggle') fromToggle.push(who);
    if (detail.source === 'remarks') fromRemarks.push(who);
    if (detail.clamped) clamped.push({ who, raw: detail.raw, source: detail.source });
  }

  const data = {
    totalQty,
    docs: fromToggle.length + fromRemarks.length,
    fromToggle: fromToggle.length,
    fromRemarks: fromRemarks.length,
    clamped,
  };

  if (fromRemarks.length === 0 && clamped.length === 0) {
    return check(
      'vitrines', 'Vitrines KPI — provenance', 'ok',
      `${totalQty} vitrines across ${data.docs} order(s), all from the order-form toggle.`,
      [], data,
    );
  }
  const details = [
    `${fromToggle.length} order(s) from the vitrine toggle (reliable).`,
    `${fromRemarks.length} order(s) inferred from free-text remarks (best effort).`,
  ];
  if (clamped.length > 0) {
    details.push(`${clamped.length} implausible quantity(ies) rewritten to 1:`);
    details.push(...clamped.slice(0, 10).map((c) => `   ${c.who} — ${c.raw} (${c.source}) counted as 1`));
  }
  return check(
    'vitrines', 'Vitrines KPI — provenance', 'warn',
    `${totalQty} vitrines, of which ${fromRemarks.length} order(s) come from parsed remarks rather than the toggle.`,
    details, data,
  );
}

/**
 * 7. Documents with no formState contribute revenue but no country, no
 * product lines and no quick stats — they are invisible below the KPI row.
 */
export function checkFormStateCoverage(base) {
  const missing = base.filter((d) => !d?.metadata?.formState);
  const withoutRows = base.filter((d) => d?.metadata?.formState && (d.metadata.formState.rows || []).length === 0);
  const data = {
    documents: base.length,
    missingFormState: missing.length,
    missingRevenue: sumAmount(missing),
    formStateWithoutRows: withoutRows.length,
  };

  if (missing.length === 0 && withoutRows.length === 0) {
    return check(
      'formstate-coverage', 'Per-document detail availability', 'ok',
      `All ${base.length} documents carry the saved order form, so every breakdown sees every document.`,
      [], data,
    );
  }
  const details = [];
  if (missing.length > 0) {
    details.push(`${missing.length} document(s) worth ${eur(data.missingRevenue)} have no saved form.`);
    details.push('They count in Total Revenue but not in Client Countries, Top Products, Quick Stats or Vitrines.');
    details.push(...missing.slice(0, 8).map((d) => `   ${d.client_company || d.client_name || 'Unknown'} — ${eur(amount(d))}`));
  }
  if (withoutRows.length > 0) {
    details.push(`${withoutRows.length} document(s) have a form but zero product lines.`);
  }
  return check(
    'formstate-coverage', 'Per-document detail availability', 'warn',
    `${missing.length + withoutRows.length} document(s) cannot contribute to the breakdown panels.`,
    details, data,
  );
}

/**
 * 8. Client Countries reads metadata.formState.country, free text normalized
 * at read time. Missing values collapse into "Unknown".
 */
export function checkCountryCoverage(base) {
  const byCountry = new Map();
  for (const d of base) {
    const name = normalizeCountry(d?.metadata?.formState?.country);
    const entry = byCountry.get(name) || { name, docs: 0, revenue: 0 };
    entry.docs++;
    entry.revenue = round2(entry.revenue + amount(d));
    byCountry.set(name, entry);
  }
  const unknown = byCountry.get('Unknown');
  const rows = [...byCountry.values()].sort((a, b) => b.revenue - a.revenue);
  const data = {
    countries: rows.length,
    unknownDocs: unknown?.docs || 0,
    unknownRevenue: unknown?.revenue || 0,
    rows,
  };

  if (!unknown) {
    return check(
      'country-coverage', 'Client Countries — coverage', 'ok',
      `Every document resolves to a country (${rows.length} distinct).`,
      [], data,
    );
  }
  return check(
    'country-coverage', 'Client Countries — coverage', 'warn',
    `${unknown.docs} document(s) worth ${eur(unknown.revenue)} have no usable country and land in "Unknown".`,
    [`${rows.length} distinct countries after normalization.`],
    data,
  );
}

/**
 * 9. DocumentsPanel loads a single folder with one un-paginated request. A
 * folder at the cap is truncated in the list AND in its analytics header.
 */
export function checkFolderSize(base, events = [], limit = FOLDER_FETCH_LIMIT) {
  const nameById = new Map(events.map((e) => [e.id, e.name]));
  const counts = new Map();
  for (const d of base) {
    if (!d.event_id) continue;
    counts.set(d.event_id, (counts.get(d.event_id) || 0) + 1);
  }
  const folders = [...counts.entries()]
    .map(([id, docs]) => ({ id, name: nameById.get(id) || 'Unknown folder', docs }))
    .sort((a, b) => b.docs - a.docs);
  const over = folders.filter((f) => f.docs >= limit);
  const largest = folders[0] || null;
  const data = { limit, largest, over, folders };

  if (over.length > 0) {
    return check(
      'folder-size', 'Folder view truncation risk', 'fail',
      `${over.length} folder(s) are at or above the ${limit}-row folder fetch cap and are being truncated.`,
      over.map((f) => `   ${f.name} — ${f.docs} documents (only the first ${limit} load)`),
      data,
    );
  }
  return check(
    'folder-size', 'Folder view truncation risk', largest && largest.docs > limit * 0.75 ? 'warn' : 'ok',
    largest
      ? `Largest folder is ${largest.name} with ${largest.docs} documents (cap ${limit}).`
      : 'No documents are filed in a folder.',
    largest && largest.docs > limit * 0.75
      ? [`Within 25% of the cap. DocumentsPanel.fetchFolderDocs does not paginate, so crossing ${limit} silently truncates that folder's total.`]
      : [],
    data,
  );
}

/**
 * 10. Data integrity: duplicate ids should be impossible, and same
 * client + same amount + same day is worth a human look.
 */
export function checkDuplicates(documents, base) {
  const seen = new Set();
  const duplicateIds = new Set();
  for (const d of documents) {
    if (!d?.id) continue;
    if (seen.has(d.id)) duplicateIds.add(d.id);
    seen.add(d.id);
  }

  const groups = new Map();
  for (const d of base.filter(isOrder)) {
    const who = String(d.client_company || d.client_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const day = String(d.created_at || '').slice(0, 10);
    if (!who || !day) continue;
    const key = `${who}|${day}|${round2(amount(d))}`;
    const entry = groups.get(key) || { who: d.client_company || d.client_name, day, amount: round2(amount(d)), count: 0 };
    entry.count++;
    groups.set(key, entry);
  }
  const suspects = [...groups.values()].filter((g) => g.count > 1 && g.amount > 0).sort((a, b) => b.amount - a.amount);
  const data = { duplicateIds: [...duplicateIds], suspects };

  if (duplicateIds.size > 0) {
    return check(
      'duplicates', 'Data integrity', 'fail',
      `${duplicateIds.size} document id(s) returned more than once — every total is inflated.`,
      [...duplicateIds].slice(0, 10).map((id) => `   ${id}`),
      data,
    );
  }
  if (suspects.length === 0) {
    return check('duplicates', 'Data integrity', 'ok', 'No duplicate ids and no same-client/same-day/same-amount orders.', [], data);
  }
  return check(
    'duplicates', 'Data integrity', 'info',
    `${suspects.length} group(s) of identical client + day + amount. Usually legitimate, worth a glance.`,
    suspects.slice(0, 10).map((s) => `   ${s.who} — ${s.count} x ${eur(s.amount)} on ${s.day}`),
    data,
  );
}

/**
 * 11. Channel split. B2C is its own dashboard scope; verify the pills add up.
 */
export function checkChannelSplit(base) {
  const orders = base.filter(isOrder);
  const b2c = orders.filter((d) => d.order_channel === 'b2c');
  const b2b = orders.filter((d) => d.order_channel !== 'b2c');
  const all = sumAmount(orders);
  const delta = round2(all - sumAmount(b2b) - sumAmount(b2c));
  const channels = new Map();
  for (const d of orders) {
    const ch = d.order_channel || '(null)';
    const entry = channels.get(ch) || { channel: ch, orders: 0, revenue: 0 };
    entry.orders++;
    entry.revenue = round2(entry.revenue + amount(d));
    channels.set(ch, entry);
  }
  const data = {
    all, b2b: sumAmount(b2b), b2c: sumAmount(b2c), delta,
    channels: [...channels.values()].sort((a, b) => b.revenue - a.revenue),
  };

  if (delta !== 0) {
    return check(
      'channel-split', 'B2B / B2C pills', 'fail',
      `B2B + B2C is off from All by ${eur(delta)}.`,
      data.channels.map((c) => `   ${c.channel} — ${c.orders} order(s), ${eur(c.revenue)}`),
      data,
    );
  }
  return check(
    'channel-split', 'B2B / B2C pills', 'ok',
    `All ${eur(all)} = B2B ${eur(data.b2b)} + B2C ${eur(data.b2c)}.`,
    data.channels.map((c) => `   ${c.channel} — ${c.orders} order(s), ${eur(c.revenue)}`),
    data,
  );
}

/**
 * 12. Product-line revenue vs the saved grand total. A gap is EXPECTED
 * (discount, shipping, custom line, vitrine, VAT) — this quantifies it so
 * "Top Products revenue doesn't match Total Revenue" stops being alarming.
 */
export function checkLineTotalsVsGrandTotal(base) {
  const orders = base.filter(isOrder);
  let lineTotal = 0;
  let comparable = 0;
  for (const d of orders) {
    const rows = d?.metadata?.formState?.rows || [];
    if (rows.length === 0) continue;
    comparable++;
    for (const r of rows) lineTotal += Number(r?.total) || 0;
  }
  const revenue = sumAmount(orders);
  const gap = round2(revenue - lineTotal);
  const data = { revenue, lineTotal: round2(lineTotal), gap, comparableOrders: comparable, orders: orders.length };

  return check(
    'line-totals', 'Top Products revenue vs Total Revenue', 'info',
    `Product lines add up to ${eur(lineTotal)} against ${eur(revenue)} of revenue — a ${eur(gap)} gap.`,
    [
      'Expected, not a bug: Total Revenue is the saved grand total (after discount, plus shipping, custom line, vitrine and VAT),',
      'while Top Products only sums the product lines. The two are not meant to be equal.',
      `${comparable} of ${orders.length} orders had product lines to compare.`,
    ],
    data,
  );
}

/**
 * Run every check.
 *
 * @param {object} params
 * @param {Array} params.documents - raw document rows (any state)
 * @param {Array} params.events - event rows [{ id, name, type }]
 * @param {number} [params.folderFetchLimit]
 */
export function runAnalyticsAudit({ documents = [], events = [], folderFetchLimit = FOLDER_FETCH_LIMIT } = {}) {
  const base = analyticsBaseDocs(documents);
  const checks = [
    checkHeadlineReconciliation(base),
    checkChannelSplit(base),
    checkFairAttribution(base, events),
    checkAgentCoverage(base),
    checkFolderSize(base, events, folderFetchLimit),
    checkFormStateCoverage(base),
    checkCountryCoverage(base),
    checkCollectionCoverage(base),
    checkAttributeBuckets(base),
    checkVitrines(base),
    checkLineTotalsVsGrandTotal(base),
    checkDuplicates(documents, base),
  ];

  const summary = { ok: 0, info: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;

  return {
    base,
    checks,
    summary,
    totals: {
      rawDocuments: documents.length,
      countedDocuments: base.length,
      revenue: sumAmount(base.filter(isOrder)),
    },
  };
}

export default runAnalyticsAudit;
