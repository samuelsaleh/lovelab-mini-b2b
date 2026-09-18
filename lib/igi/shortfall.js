/**
 * What went missing on a movement, in two places it can go missing.
 *
 * Sam, 18 Sept 2026: "if IGI give us things, but things are missing from
 * what they give us — how do we manage that?" Three figures live on every
 * line: what LoveLab asked, what IGI made, what came back across the road.
 * A gap between the first two is IGI making fewer than asked (normal — they
 * make what their stock allows). A gap between the last two is certificates
 * IGI say they made that LoveLab did not count on arrival — the one that
 * needs a phone call the same day.
 *
 * Nothing is carried forward. The shelf still reads low, so the next
 * Dashboard visit asks again; a "still owed" figure would only go stale.
 * What was missing is being *told*, and that is what these two sums feed:
 * the emails in lib/igi/notify.js and the chips on the Movements list.
 */

/** Certificates asked for but not made: Σ max(0, asked − made), once IGI have recorded what they made. */
export function shortOnIssue(lines) {
  return (lines || [])
    .filter((l) => l.qty_issued != null)
    .reduce((t, l) => t + Math.max(0, (l.qty_requested ?? 0) - l.qty_issued), 0)
}

/** Certificates IGI made that did not come back: Σ max(0, made − received), once the return is confirmed. */
export function shortOnReturn(lines) {
  return (lines || [])
    .filter((l) => l.qty_received != null)
    .reduce((t, l) => t + Math.max(0, (l.qty_issued ?? 0) - l.qty_received), 0)
}
