/**
 * Fixed strings in the outreach email shell — the section heading, benefit
 * pills, contact label and the two default buttons.
 *
 * Claude translates the body copy per lead, but these five never change, so
 * they are a table rather than an API call: deterministic, free, and the same
 * wording in every email to a given market. A German lead used to get a
 * perfectly German letter wrapped in "EXPLORE OUR COLLECTIONS", "14 days
 * return" and "Visit our website".
 *
 * Keys must cover every code in languages.js LANGUAGE_LABELS; anything missing
 * falls back to English.
 */
const CHROME = {
  en: { explore: 'Explore our collections',      returns: '14 days return',            shipping: 'Worldwide shipping',        contact: 'Contact',       visit: 'Visit our website',          b2b: 'B2B Login' },
  de: { explore: 'Entdecken Sie unsere Kollektionen', returns: '14 Tage Rückgaberecht',  shipping: 'Weltweiter Versand',        contact: 'Kontakt',       visit: 'Website besuchen',           b2b: 'B2B-Login' },
  fr: { explore: 'Découvrez nos collections',     returns: 'Retour sous 14 jours',      shipping: 'Livraison internationale',  contact: 'Contact',       visit: 'Visiter le site',            b2b: 'Espace B2B' },
  nl: { explore: 'Ontdek onze collecties',        returns: '14 dagen retourrecht',      shipping: 'Wereldwijde verzending',    contact: 'Contact',       visit: 'Bezoek onze website',        b2b: 'B2B-login' },
  it: { explore: 'Scopri le nostre collezioni',   returns: 'Reso entro 14 giorni',      shipping: 'Spedizione in tutto il mondo', contact: 'Contatti',   visit: 'Visita il sito',             b2b: 'Area B2B' },
  es: { explore: 'Descubre nuestras colecciones', returns: 'Devolución en 14 días',     shipping: 'Envío internacional',       contact: 'Contacto',      visit: 'Visitar la web',             b2b: 'Acceso B2B' },
  pt: { explore: 'Descubra as nossas coleções',   returns: 'Devolução em 14 dias',      shipping: 'Envio internacional',       contact: 'Contacto',      visit: 'Visitar o site',             b2b: 'Área B2B' },
  pl: { explore: 'Odkryj nasze kolekcje',         returns: '14 dni na zwrot',           shipping: 'Wysyłka na cały świat',     contact: 'Kontakt',       visit: 'Odwiedź naszą stronę',       b2b: 'Logowanie B2B' },
  el: { explore: 'Ανακαλύψτε τις συλλογές μας',   returns: 'Επιστροφή εντός 14 ημερών', shipping: 'Παγκόσμια αποστολή',        contact: 'Επικοινωνία',   visit: 'Επισκεφθείτε τον ιστότοπο', b2b: 'Σύνδεση B2B' },
  tr: { explore: 'Koleksiyonlarımızı keşfedin',   returns: '14 gün iade',               shipping: 'Dünya geneline kargo',      contact: 'İletişim',      visit: 'Web sitemizi ziyaret edin',  b2b: 'B2B Girişi' },
  he: { explore: 'גלו את הקולקציות שלנו',          returns: 'החזרה תוך 14 יום',           shipping: 'משלוח לכל העולם',            contact: 'צור קשר',       visit: 'בקרו באתר',                  b2b: 'כניסת B2B' },
  ja: { explore: 'コレクションを見る',              returns: '14日間返品可',               shipping: '全世界へ配送',               contact: 'お問い合わせ',   visit: 'ウェブサイトへ',              b2b: 'B2Bログイン' },
  zh: { explore: '探索我们的系列',                  returns: '14天退货',                   shipping: '全球配送',                   contact: '联系我们',       visit: '访问网站',                    b2b: 'B2B登录' },
  ko: { explore: '컬렉션 둘러보기',                 returns: '14일 반품 가능',             shipping: '전 세계 배송',               contact: '문의',           visit: '웹사이트 방문',               b2b: 'B2B 로그인' },
};

export function chromeStrings(lang) {
  return CHROME[lang] || CHROME.en;
}

/**
 * The batch's button labels default to the English strings. When Sam has left
 * them on the default, translate; when he typed his own label, keep it.
 */
export function localizeButtonLabel(label, lang) {
  const c = chromeStrings(lang);
  const norm = String(label || '').trim().toLowerCase();
  if (norm === 'visit our website') return c.visit;
  if (norm === 'b2b login') return c.b2b;
  return label;
}
