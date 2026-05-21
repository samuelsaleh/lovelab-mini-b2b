// One template per recipient type. The Outreach tab lets Alberto pick a
// type-specific preset for the batch; per-lead overrides happen via the Edit
// Lead modal's lead_type dropdown, and generate-all then picks the matching
// template at draft time so a batch of 50 cards can ship 3 different emails.
//
// Important: LoveLab has NO showroom in Antwerp. Never invite someone to
// "visit our showroom" — invite them to a phone call or Google Meet instead.

export const FAIR_LEAD_TYPES = [
  { id: 'shop',    label: 'Shop / Concept store / Jeweler', hint: 'Default. Independent boutique or jewelry retailer.' },
  { id: 'agent',   label: 'Agent / Wholesale rep',          hint: 'Represents the brand to retailers in a territory.' },
  { id: 'partner', label: 'Partner / Collaboration',        hint: 'Broader business partnership, co-branding, etc.' },
  { id: 'other',   label: 'Other',                          hint: 'No specific template — use the batch default.' },
]

export const FAIR_OUTREACH_TEMPLATES = [
  {
    id: 'generic',
    name: 'Generic fair follow-up (shops)',
    lead_type: 'shop',
    headline: 'Great meeting you at {fairName}',
    paragraph1: 'It was a pleasure connecting at {fairName}. We would love to continue the conversation and share our latest lab-grown coloured-diamond collections with you.',
    paragraph2: 'I would be delighted to send you our lookbook or set up a quick call or Google Meet whenever it suits you. Just reply and let me know what works best.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    id: 'vicenzaoro',
    name: 'Vicenzaoro follow-up (shops)',
    lead_type: 'shop',
    headline: 'Thank you for visiting us at Vicenzaoro',
    paragraph1: 'It was wonderful meeting you at Vicenzaoro ({fairName}) and discussing our colourful diamond thread collections with you.',
    paragraph2: 'Happy to send the full lookbook or schedule a quick Google Meet to walk you through the CUTY, CUBIX, MATCHY and TRIPLY lines whenever suits you best.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    // Matches the "Thank You for Visiting Us" reference email — fair name shows
    // as the gold uppercase subtitle in the rendered HTML; body text below
    // sits around the Visit Our Website / B2B Login button row.
    id: 'inhorgenta_fiera_2026',
    name: 'Inhorgenta Munich + Fiera Milano 2026 (shops)',
    lead_type: 'shop',
    headline: 'Thank You for Visiting Us',
    paragraph1: 'It was a pleasure meeting you at our booth during Inhorgenta Munich and Fiera Milano. We truly appreciate the time you spent with us and the interest you showed in LOVELAB and our collections.',
    paragraph2: 'We are excited to share that our website is now live and ready for you to explore our full range of products. We also offer a dedicated B2B login area where you can access exclusive pricing, place orders, and manage your account directly.\n\nTo help you review our offering at your convenience, we have included our latest catalogue in English with this email. We hope it gives you a comprehensive overview of what LOVELAB has to offer.\n\nIf you would like to discuss a partnership, place an order, or have any sales-related questions, please do not hesitate to reach out directly to alberto@love-lab.com\n\nWe look forward to the opportunity of working together and hope to hear from you soon.',
    signoff: 'Warm regards,\nDionne Saleh\nLove Group BV',
  },
  {
    id: 'jck',
    name: 'JCK Las Vegas follow-up (shops)',
    lead_type: 'shop',
    headline: 'Following up from JCK Las Vegas',
    paragraph1: 'Thank you for stopping by the LoveLab booth at {fairName}. It was a pleasure meeting you and learning more about {company}.',
    paragraph2: 'I would love to send you our latest lookbook and set up a Google Meet or phone call to discuss how we can work together.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    id: 'agent_intro',
    name: 'Agent / wholesale rep intro',
    lead_type: 'agent',
    headline: 'Following up from {fairName} — partnership chat',
    paragraph1: 'It was great meeting you at {fairName}. As you mentioned representing brands across your territory, I would love to explore whether LoveLab could be a fit alongside what you already carry.',
    paragraph2: 'Would you be open to a short call or Google Meet in the coming days to discuss territory, terms, and how we typically work with agents? Pick any slot that suits you and I will adapt.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    id: 'partner_intro',
    name: 'Partnership / collaboration intro',
    lead_type: 'partner',
    headline: 'Following up from {fairName}',
    paragraph1: 'Really enjoyed meeting you at {fairName}. From our conversation it feels like there could be an interesting angle between LoveLab and {company}.',
    paragraph2: 'Would a 20-minute call or Google Meet next week work to explore where this could go? No agenda from my side — just keen to hear what you are imagining.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
];

export function getFairTemplate(id) {
  return FAIR_OUTREACH_TEMPLATES.find((t) => t.id === id) || FAIR_OUTREACH_TEMPLATES[0];
}

/**
 * Pick the best default template for a given lead type.
 * Used by generate-all when a lead has a lead_type that differs from the batch's
 * primary template — so a batch of 50 can ship 3 different email bodies.
 */
export function defaultTemplateForLeadType(leadType) {
  if (!leadType) return FAIR_OUTREACH_TEMPLATES[0];
  return FAIR_OUTREACH_TEMPLATES.find((t) => t.lead_type === leadType) || FAIR_OUTREACH_TEMPLATES[0];
}
