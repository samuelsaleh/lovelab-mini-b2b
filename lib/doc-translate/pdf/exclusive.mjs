/**
 * One at a time. The server is small (2 GB, shared with the ERP), so two PDF jobs
 * must never hold their memory together: each call waits for the one before it,
 * and a failed call never blocks the next.
 */
let tail = Promise.resolve()

export function runExclusive(fn) {
  const run = tail.then(fn, fn)
  tail = run.catch(() => {})
  return run
}
