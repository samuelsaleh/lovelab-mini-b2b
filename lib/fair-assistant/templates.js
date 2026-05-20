export const FAIR_OUTREACH_TEMPLATES = [
  {
    id: 'generic',
    name: 'Generic fair follow-up',
    headline: 'Great meeting you at {fairName}',
    paragraph1: 'It was a pleasure connecting at {fairName}. We would love to continue the conversation and share our latest lab-grown diamond collections with you.',
    paragraph2: 'If you would like a lookbook or to schedule a visit, just reply to this email.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    id: 'vicenzaoro',
    name: 'Vicenzaoro follow-up',
    headline: 'Thank you for visiting us at Vicenzaoro',
    paragraph1: 'Hi, it was wonderful meeting you at Vicenzaoro ({fairName}). We enjoyed discussing our colorful diamond thread collections with you.',
    paragraph2: 'We would be delighted to show you more of the CUTY, CUBIX, MATCHY and TRIPLY lines at your convenience.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
  {
    id: 'jck',
    name: 'JCK Las Vegas follow-up',
    headline: 'Following up from JCK Las Vegas',
    paragraph1: 'Thank you for stopping by the LoveLab booth at {fairName}. It was a pleasure meeting you and learning more about {company}.',
    paragraph2: 'We would love to share our latest collections and discuss how we can work together.',
    signoff: 'Warm regards,\nAlberto Saleh\nLoveLab Antwerp',
  },
];

export function getFairTemplate(id) {
  return FAIR_OUTREACH_TEMPLATES.find((t) => t.id === id) || FAIR_OUTREACH_TEMPLATES[0];
}
