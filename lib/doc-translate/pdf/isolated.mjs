/**
 * extractPdf / renderPdf with the same signatures as ./index.mjs, but each call
 * runs in its own short-lived child process (worker.mjs), one at a time.
 */
import { fork } from 'node:child_process'
import path from 'node:path'
import { runExclusive } from './exclusive.mjs'

const WORKER = () => path.join(process.cwd(), 'lib/doc-translate/pdf/worker.mjs')
const TIMEOUT_MS = 120_000
// The JS heap of the child is capped; the WASM memory comes on top (~150-200 MB for the biggest catalogue).
const CHILD_FLAGS = ['--max-old-space-size=384']

function callWorker(message) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER(), [], { serialization: 'advanced', execArgv: CHILD_FLAGS, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    let settled = false
    const done = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(reject, new Error('PDF worker timed out'))
    }, TIMEOUT_MS)
    child.once('message', (reply) => (reply?.ok ? done(resolve, reply.result) : done(reject, new Error(reply?.error || 'PDF worker failed'))))
    child.once('error', (err) => done(reject, err))
    child.once('exit', (code, signal) => done(reject, new Error(`PDF worker stopped (${signal || `code ${code}`})`)))
    child.send(message)
  })
}

export const extractPdf = (bytes) => runExclusive(() => callWorker({ op: 'extract', bytes: new Uint8Array(bytes) }))
export const renderPdf = (bytes, translations) => runExclusive(() => callWorker({ op: 'render', bytes: new Uint8Array(bytes), translations }))
