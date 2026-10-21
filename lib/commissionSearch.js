/**
 * Free-text search over commission rows (Dionne, 21 Oct 2026): "a search
 * button on every agent where we can type an order number, an invoice
 * number or a customer name".
 *
 * Matches, case- and accent-insensitively, against:
 *   - the customer: company, contact name, quick-order label
 *   - the invoice number typed in the admin panel
 *   - the order: website order number, the PDF file name (which carries the
 *     company, the date and the document id) and the document id itself
 *
 * Every word of the query must match somewhere ("curioza 2603" finds the
 * CURIOZA line whose invoice starts with 2603).
 */

const fold = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

export function commissionSearchText(row) {
  if (!row) return '';
  const doc = row.document || {};
  const meta = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {};
  const form = meta.formState && typeof meta.formState === 'object' ? meta.formState : {};
  return fold([
    doc.client_company,
    doc.client_name,
    form.contactName,
    form.companyName,
    row.client_label,
    row.invoice_number,
    meta.order_number,
    doc.file_name,
    doc.id || row.document_id,
    row.id,
  ].filter(Boolean).join(' '));
}

export function commissionMatchesQuery(row, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = commissionSearchText(row);
  return words.every((w) => haystack.includes(w));
}
