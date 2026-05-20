import crypto from 'crypto';

export function computeLeadHash({ email, firstName, lastName, company }) {
  const raw = [
    (email || '').trim().toLowerCase(),
    (firstName || '').trim().toLowerCase(),
    (lastName || '').trim().toLowerCase(),
    (company || '').trim().toLowerCase(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function parseLeadCreatedCallback(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON body' };
  }

  const event = body.event || body.type;
  if (!event) {
    return { ok: false, error: 'Missing event' };
  }

  if (!body.batchId) {
    return { ok: false, error: 'Missing batchId' };
  }

  return {
    ok: true,
    value: {
      event,
      batchId: body.batchId,
      imageId: body.imageId || null,
      lead: body.lead || null,
      error: body.error || null,
      summary: body.summary || null,
    },
  };
}

export function normalizeLeadPayload(lead = {}) {
  return {
    first_name: (lead.firstName || lead.first_name || '').trim() || null,
    last_name: (lead.lastName || lead.last_name || '').trim() || null,
    company: (lead.company || '').trim() || null,
    email: (lead.email || '').trim() || null,
    phone: (lead.phone || '').trim() || null,
    mobile_phone: (lead.mobilephone || lead.mobile_phone || '').trim() || null,
    title: (lead.title || '').trim() || null,
    country: (lead.country || '').trim() || null,
    street: (lead.street || '').trim() || null,
    city: (lead.city || '').trim() || null,
    state: (lead.state || '').trim() || null,
    postal_code: (lead.postalCode || lead.postal_code || '').trim() || null,
    salesforce_id: (lead.salesforceId || lead.salesforce_id || lead.Id || '').trim() || null,
    salesforce_url: (lead.salesforceUrl || lead.salesforce_url || '').trim() || null,
    lead_type: normalizeLeadType(lead.leadType || lead.lead_type || lead.type),
  };
}

const VALID_LEAD_TYPES = new Set(['shop', 'agent', 'partner', 'other']);

function normalizeLeadType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_LEAD_TYPES.has(v)) return v;
  // Forgive common variants
  if (v.startsWith('concept') || v.includes('jeweler') || v.includes('boutique') || v === 'store') return 'shop';
  if (v.includes('agent') || v.includes('rep') || v.includes('wholesale')) return 'agent';
  if (v.includes('partner') || v.includes('collab')) return 'partner';
  return null;
}

/**
 * Infer the lead's type from whatever the OCR extracted (title, description, company).
 * Multi-language because cards from Italian/French/Dutch fairs are common.
 * Returns 'shop' as a safe default rather than null so the lead has SOMETHING.
 */
export function inferLeadType({ title, company, description, ocrText } = {}) {
  const haystack = `${title || ''} ${company || ''} ${description || ''} ${ocrText || ''}`.toLowerCase();
  if (!haystack.trim()) return 'shop';

  // AGENT signals — sales rep / wholesale / territorial representation.
  // EN: agent, rep, wholesale, distributor.
  // IT: rappresentante, agente, distributore, rivenditore.
  // FR: agent commercial, représentant, distributeur, grossiste.
  // DE: handelsvertreter, vertreter, großhändler.
  if (/\b(agent|agente|agente\s+commerciale|sales\s*rep|representative|rappresentante|repr[eé]sentant|distribut(?:or|eur|ore)|wholesale|grossiste|großhändler|handelsvertreter|rivenditore)\b/.test(haystack)) {
    return 'agent';
  }

  // PARTNER signals — collaboration, co-branding, business development.
  if (/\b(partner|partnership|collaboration|co[- ]brand|biz\s*dev|business\s*development|joint\s*venture|alleanza)\b/.test(haystack)) {
    return 'partner';
  }

  // SHOP signals (default) — boutique, jeweler, retailer, store, concept store.
  // We don't need to match these explicitly since shop is the fallback, but a
  // strong shop signal makes us confident enough to keep the default.
  return 'shop';
}
