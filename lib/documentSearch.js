/**
 * One matcher for “find this order by company / client”.
 *
 * Documents often leave `client_company` blank and keep the name on the
 * saved form (`metadata.formState.companyName`). Analytics export already
 * falls back to that field; search has to as well or mum types a company
 * she knows and gets nothing.
 */

import { resolveClientName } from './analyticsAliases.js'
import { documentAttributionSearchText } from './documentAttribution.js'

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`´’-]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formStateOf(doc) {
  return doc?.metadata?.formState || {}
}

function documentFrom(docOrRow) {
  if (docOrRow?.document && (docOrRow.type || docOrRow.document_id || docOrRow.commission_amount != null)) {
    return docOrRow.document
  }
  return docOrRow || {}
}

/**
 * Every string a person might type to find this order.
 * Accepts a document or a commission row (`row.document` + `row.client_label`).
 */
export function documentSearchHaystack(docOrRow = {}) {
  const doc = documentFrom(docOrRow)
  const fs = formStateOf(doc)
  const rawNames = [
    doc.client_company,
    doc.client_name,
    fs.companyName,
    fs.company,
    docOrRow.client_company,
    docOrRow.client_label,
  ].filter(Boolean)

  const parts = [
    ...rawNames,
    doc.file_name,
    fs.contactName,
    docOrRow.client_label,
    documentAttributionSearchText(doc),
    ...rawNames.map((raw) => resolveClientName(raw).name),
  ]

  return parts.filter(Boolean).map(normalizeSearchText).filter(Boolean).join(' ')
}

export function documentMatchesSearch(docOrRow, query) {
  const needle = normalizeSearchText(query)
  if (!needle) return true
  const hay = documentSearchHaystack(docOrRow)
  if (hay.includes(needle)) return true
  const aliased = normalizeSearchText(resolveClientName(query).name)
  return Boolean(aliased) && hay.includes(aliased)
}
