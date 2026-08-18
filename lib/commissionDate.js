/**
 * Date shown in commission history.
 *
 * Document-linked orders belong to the date of the original order, not the
 * date a missing commission row happened to be materialized. Manual orders
 * and every bonus keep their own ledger timestamp.
 */
export function commissionDisplayDate(row) {
  if (row?.type === 'order' && row?.document?.created_at) {
    return row.document.created_at
  }
  return row?.created_at || null
}
