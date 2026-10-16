'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatQty, visitRef, modelSpec } from '@/lib/igi/derive'
import { formatDate } from '@/lib/igi/dates'

/**
 * A request on paper, for the bench.
 *
 * Mika, 16 Oct 2026: "j'aurais besoin d'une feature qui me permet d'imprimer
 * le batch que vous envoyez — ça permet à l'équipe d'avoir une feuille de ce
 * qu'ils doivent prendre comme carte. Il y a souvent des erreurs : une pièce
 * en plus ou en moins."
 *
 * So one line per model, in serial order — the order the boxes are in — with
 * the spec beside the serial (the two travel together, see SerialSpec), how
 * many were asked, and an empty box to write what was actually counted. The
 * foot is for the two people who prepared and checked it, which is what turns
 * a sheet into a check.
 *
 * Rendered into <body>, outside the app's chrome, and only ever visible in
 * print: the screen is unchanged while the browser's print dialog is open.
 */
export default function BatchPrintSheet({ visit, onDone }) {
  // Held in a ref so a parent re-render cannot open the print dialog twice.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    document.body.classList.add('printing-batch')
    const done = () => {
      document.body.classList.remove('printing-batch')
      onDoneRef.current?.()
    }
    window.addEventListener('afterprint', done, { once: true })
    // Let the sheet reach the DOM before the dialog opens.
    const timer = setTimeout(() => window.print(), 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing-batch')
    }
  }, [])

  if (typeof document === 'undefined') return null

  const lines = sortedLines(visit.lines)
  const asked = lines.reduce((t, l) => t + (l.qty_requested || 0), 0)

  return createPortal(
    <div className="certprint" data-testid="print-sheet">
      <header>
        <div>
          <div className="eyebrow">LoveLab · certificate request</div>
          <h1>{visitRef(visit)}</h1>
        </div>
        <div className="meta">
          <div>Asked on <b>{formatDate(visit.visit_date)}</b></div>
          <div><b>{formatQty(asked)}</b> certificates · <b>{lines.length}</b> model{lines.length === 1 ? '' : 's'}</div>
        </div>
      </header>

      <table>
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Serial</th>
            <th>Model</th>
            <th>Spec</th>
            <th className="q">Asked</th>
            <th className="q">Counted</th>
            <th className="tick">✓</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} data-testid="print-line">
              <td className="n">{i + 1}</td>
              <td className="serial">{l.serial || '—'}</td>
              <td>{l.name}</td>
              <td className="spec">{sheetSpec(l) || '—'}</td>
              <td className="q">{formatQty(l.qty_requested)}</td>
              <td className="q"><span className="box" /></td>
              <td className="tick"><span className="check" /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td className="q" data-testid="print-total">{formatQty(asked)}</td>
            <td className="q"><span className="box" /></td>
            <td />
          </tr>
        </tfoot>
      </table>

      <p className="rule">
        Count each model against its serial <i>and</i> its spec. A card more or a card less: write the real
        number in “Counted”, and put that number in the app as “You made”.
      </p>

      <footer>
        <div>Prepared by <span /></div>
        <div>Checked by <span /></div>
        <div>Date <span /></div>
      </footer>
    </div>,
    document.body,
  )
}

/** Serial order, which is the order the cards are boxed in. */
export function sortedLines(lines) {
  return [...(lines || [])].sort((a, b) =>
    String(a.serial || '').localeCompare(String(b.serial || ''), undefined, { numeric: true }))
}

/** "4 st · 0,4 ct · Round · D/E" — the colour grade too, since two models can differ only by it. */
export function sheetSpec(line) {
  return [modelSpec(line), line.spec].filter(Boolean).join(' · ')
}
