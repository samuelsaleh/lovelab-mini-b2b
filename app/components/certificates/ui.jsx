'use client'

/**
 * The certificate application's building blocks.
 *
 * All presentation lives in app/certificates/certificates.css. These wrappers
 * exist so a screen reads as what it is showing rather than as a pile of
 * div classNames, and so the markup the stylesheet expects is written once.
 */

/** The title line at the top of every screen. */
export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub ? <span className="sub">{sub}</span> : null}
      {children ? <span className="right">{children}</span> : null}
    </div>
  )
}

/** A bordered panel, optionally with a heading strip. */
export function Card({ title, sub, head, children, flush = false, testId }) {
  return (
    <section className="card" data-testid={testId}>
      {(title || head) && (
        <div className="card-head">
          {title ? <h3>{title}</h3> : null}
          {sub ? <span className="sub">{sub}</span> : null}
          {head ? <span className="right">{head}</span> : null}
        </div>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  )
}

/** A row of headline figures. */
export function Kpis({ children }) {
  return <div className="kpis">{children}</div>
}

/**
 * One headline figure.
 * tone: 'w' signal · 'a' accent · 'g' good · undefined plain.
 */
export function Kpi({ value, label, tone, testId }) {
  return (
    <div className="kpi" data-testid={testId}>
      <span className={tone ? `n ${tone}` : 'n'}>{value}</span>
      <span className="l">{label}</span>
    </div>
  )
}

/** A table that scrolls sideways rather than squashing. */
export function TableWrap({ children }) {
  return <div className="tblwrap">{children}</div>
}

/** What a table says when it has nothing to say. */
export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

/** The whole screen while it is still fetching. */
export function Loading() {
  return <div className="loading">Loading</div>
}

/** An explanatory paragraph. `warn` for the ones that mean something is off. */
export function Note({ warn = false, children, testId }) {
  return <div className={warn ? 'note warn' : 'note'} data-testid={testId}>{children}</div>
}

/** A confirmation or a failure, dismissible. */
export function Toast({ bad = false, children, onDismiss, testId }) {
  return (
    <div className={bad ? 'toast bad' : 'toast'} data-testid={testId}>
      <span>{children}</span>
      <span className="sp" />
      {onDismiss ? (
        <button className="btn" onClick={onDismiss} data-testid="dismiss-error">Dismiss</button>
      ) : null}
    </div>
  )
}

/** A button. `kind` is 'primary', 'on' or undefined. */
export function Btn({ kind, onClick, disabled, children, testId, type = 'button' }) {
  return (
    <button
      type={type}
      className={kind ? `btn ${kind}` : 'btn'}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

/** A segmented control — one choice out of a few. */
export function Switch({ options, value, onChange, testId }) {
  return (
    <div className="switch" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          data-testid={`${testId}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
