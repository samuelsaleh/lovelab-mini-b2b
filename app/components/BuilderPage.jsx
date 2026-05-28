'use client'

import { useCallback, useState, useRef, useMemo, useEffect } from 'react'
import { COLLECTIONS, CORD_COLORS, CORD_TYPE_LABELS, HOUSING, calculateQuote, getDefaultCert, getPrice, DEFAULT_PRICELIST, PRICELISTS, PRICELIST_LABELS, resolvePricelist } from '@/lib/catalog'
import { fmt } from '@/lib/utils'
import { colors, fonts } from '@/lib/styles'
import { useIsMobile, useIsTablet } from '@/lib/useIsMobile'
import CollectionConfig from './CollectionConfig'
import { useI18n } from '@/lib/i18n'
import { sendBuilderChat } from '@/lib/api'
import { findPackshot } from '@/lib/packshot-lookup'
import PackBuilderModal from './PackBuilderModal'

let _uidCounter = 0
export function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${++_uidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Exported helpers (used by App.jsx) ───
export function mkColorConfig(colorName, minC = 1) {
  return {
    id: uniqueId(),
    colorName,
    caratIdx: null,
    housing: null,
    housingType: null,
    multiAttached: null,
    shape: null,
    size: null,
    cordType: null,
    thickness: null,
    // Bracelet thread closure: only used for hasClosure collections (CUTY,
    // CUBIX). Values: 'braided' | 'nonBraided' | null. Stays null on every
    // other collection so existing rows are unaffected.
    closureType: null,
    qty: minC,
    priceOverride: null,
    certType: null,
  }
}

export function mkLine() {
  return {
    uid: uniqueId(),
    collectionId: null,
    colorConfigs: [],
    expanded: true,
    sameForAll: false,
    sharedSettings: {
      caratIdx: null, housing: null, housingType: null,
      multiAttached: null, shape: null, size: null, cordType: null, thickness: null,
      // Cert + closure carry on shared settings so the "Same settings for all
      // colours" panel can also drive them. Both default to null on a fresh
      // line — first row picks resolve them.
      certType: null, closureType: null,
      qty: null,
    },
  }
}

// ─── Button Styles ───
const btnPrimary = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s',
}
const btnSecondary = {
  padding: '10px 24px', borderRadius: 10, border: `1.5px solid ${colors.inkPlum}`,
  background: '#fff', color: colors.inkPlum, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
}
const btnGhost = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s',
}

// ─── Standard Packs ───
// Pre-built order templates based on curated consignment selections.
// Each pack stores formRows (order-form row format) that get converted to builder lines on apply.
const PACK1_ROWS = [
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Heart', bpColor: 'Yellow', setting: 'Bezel', size: '', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Heart', bpColor: 'White', setting: 'Bezel', size: '', colorCord: 'Gold', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Pear', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Pear', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Marquise', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Marquise', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Oval', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Oval', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Emerald', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Emerald', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'MULTI FIVE', carat: '0.25', bpColor: 'White', setting: '', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '95', shape: '', cert: 'IGI' },
  { collection: 'MULTI FIVE', carat: '0.50', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '130', shape: '', cert: 'IGI' },
  { collection: 'MULTI FOUR', carat: '0.20', bpColor: 'White', setting: '', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '85', shape: '', cert: 'IGI' },
  { collection: 'MULTI FOUR', carat: '0.40', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '110', shape: '', cert: 'IGI' },
]

const PACK2_ROWS = [
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Marquise', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Pear', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Oval', bpColor: 'Yellow', setting: 'Prong', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.50', shape: 'Emerald', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '155', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Heart', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.50', shape: 'Heart', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '155', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Emerald', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Emerald', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '200', cert: 'IGI' },
  { collection: 'MATCHY FANCY', carat: '1.00', shape: 'Pear', bpColor: 'YY', setting: 'Prong', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '310', cert: 'IGI' },
  { collection: 'MATCHY FANCY', carat: '0.60', shape: 'Heart', bpColor: 'WY', setting: 'Bezel', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '200', cert: 'IGI' },
]

const _p3Colors8a = ['Red', 'Bordeaux', 'Dark Pink', 'Gold', 'Navy Blue', 'Lilac', 'Black', 'Silver Grey']
const _p3Colors8b = ['Bordeaux', 'Dark Pink', 'Gold', 'Navy Blue', 'Lilac', 'Black', 'Silver Grey', 'Red']
const _p3Colors8c = ['Bordeaux', 'Light Pink', 'Gold', 'Navy Blue', 'Lilac', 'Black', 'Silver Grey', 'Red']
const PACK3_ROWS = [
  ...CORD_COLORS.nylon.map(c => ({ collection: 'CUTY', carat: '0.05', bpColor: 'White', size: 'M', colorCord: c.n, quantity: '1', unitPrice: '24', shape: '', setting: '', cert: 'In-house' })),
  ..._p3Colors8a.map(c => ({ collection: 'CUTY', carat: '0.10', bpColor: 'Yellow', size: 'M', colorCord: c, quantity: '1', unitPrice: '34', shape: '', setting: '', cert: 'In-house' })),
  ..._p3Colors8b.map(c => ({ collection: 'CUBIX', carat: '0.05', bpColor: 'White', size: 'S/M', colorCord: c, quantity: '1', unitPrice: '24', shape: '', setting: '', cert: 'In-house' })),
  ..._p3Colors8c.map(c => ({ collection: 'CUBIX', carat: '0.10', bpColor: 'Yellow', size: 'S/M', colorCord: c, quantity: '1', unitPrice: '34', shape: '', setting: '', cert: 'In-house' })),
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'YYY', setting: 'F', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'YWP', setting: 'LO', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'PPP', setting: 'F', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'WWW', setting: 'F', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.30', bpColor: 'YYY', setting: 'F', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '95', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.30', bpColor: 'YWP', setting: 'LO', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '95', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.30', bpColor: 'WWW', setting: 'F', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '95', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.30', bpColor: 'WWW', setting: 'LO', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '95', shape: '', cert: 'IGI' },
]

const PACK4_ROWS = [
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Heart', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Pear', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Marquise', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Emerald', bpColor: 'Yellow', setting: 'Bezel', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.10', shape: 'Oval', bpColor: 'White', setting: 'Bezel', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '55', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Oval', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Emerald', bpColor: 'Yellow', setting: 'Prong', size: 'M', colorCord: 'Lilac', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'SHAPY SHINE FANCY', carat: '0.30', shape: 'Pear', bpColor: 'White', setting: 'Prong', size: 'M', colorCord: 'Light Pink', quantity: '1', unitPrice: '100', cert: 'IGI' },
  { collection: 'MULTI FOUR', carat: '0.20', bpColor: 'White', setting: '', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '85', shape: '', cert: 'IGI' },
  { collection: 'MULTI FOUR', carat: '0.20', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '85', shape: '', cert: 'IGI' },
  { collection: 'MULTI FOUR', carat: '0.20', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '85', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: '', setting: 'LO', size: '', colorCord: 'Gold', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'WWW', setting: 'F', size: '', colorCord: 'Black', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'MULTI THREE', carat: '0.15', bpColor: 'YYY', setting: 'F', size: '', colorCord: 'Bordeaux', quantity: '1', unitPrice: '65', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Red', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Gold', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Black', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.05', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Red', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Gold', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Black', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'S/M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUBIX', carat: '0.10', bpColor: 'White', setting: '', size: 'S/M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'White', setting: '', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'White', setting: '', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'White', setting: '', size: 'M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.05', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '30', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'White', setting: '', size: 'M', colorCord: 'Gold', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Silver Grey', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'White', setting: '', size: 'M', colorCord: 'Black', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'White', setting: '', size: 'M', colorCord: 'Navy Blue', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Red', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
  { collection: 'CUTY', carat: '0.10', bpColor: 'Yellow', setting: '', size: 'M', colorCord: 'Bordeaux', quantity: '1', unitPrice: '40', shape: '', cert: 'IGI' },
]

const PACKS = [
  {
    id: 'pack-1',
    label: 'Pack 1',
    fixedTotal: 970,
    description: [
      'SHAPY SHINE FANCY — 0.10 ct, Bezel, 5 shapes',
      'MULTI FIVE — 0.25 & 0.50 ct',
      'MULTI FOUR — 0.20 & 0.40 ct',
    ],
    budget: '€55 – €130/bracelet',
    formRows: PACK1_ROWS,
  },
  {
    id: 'pack-2',
    label: 'Pack 2',
    fixedTotal: 1520,
    description: [
      'SHAPY SHINE FANCY — 0.30 & 0.50 ct, 5 shapes',
      'MATCHY FANCY — 0.60 & 1.00 ct, 3 shapes',
    ],
    budget: '€100 – €310/bracelet',
    formRows: PACK2_ROWS,
  },
  {
    id: 'pack-3',
    label: 'Pack 3',
    fixedTotal: 1856,
    description: [
      'CUTY — 0.05 & 0.10 ct, size M (In-house)',
      'CUBIX — 0.05 & 0.10 ct, size S/M (In-house)',
      'MULTI THREE — 0.15 & 0.30 ct, mixed housing, size M (IGI)',
    ],
    budget: '€24 – €95/bracelet',
    formRows: PACK3_ROWS,
  },
  {
    id: 'pack-4',
    label: 'Pack 4',
    fixedTotal: 1800,
    description: [
      'SHAPY SHINE FANCY — 0.10 ct Bezel + 0.30 ct Prong, 5 shapes',
      'MULTI FOUR — 0.20 ct',
      'MULTI THREE — 0.15 ct, mixed housing',
      'CUBIX — 0.05 & 0.10 ct, size S/M',
      'CUTY — 0.05 & 0.10 ct, size M',
    ],
    budget: '€30 – €100/bracelet',
    formRows: PACK4_ROWS,
  },
]

// ─── Compute total order estimate for a pack ───
// pricelistYear is forwarded so pack price estimates show the same year the
// agent currently has selected. Defaults to DEFAULT_PRICELIST when absent so
// any caller that hasn't been updated still works.
function computePackTotal(pack, pricelistYear) {
  if (pack.fixedTotal != null) return pack.fixedTotal
  if (!pack.lines) return 0
  return pack.lines.reduce((sum, line) => {
    const col = COLLECTIONS.find(c => c.id === line.collectionId)
    if (!col) return sum
    const colorCount = (CORD_COLORS[col.cord] || []).length
    const minQty = col.minC || 1
    const cert = getDefaultCert(col)
    const lineTotal = line.caratIndices.reduce((s, ci) => s + getPrice(col, ci, cert, pricelistYear), 0)
    return sum + lineTotal * colorCount * minQty
  }, 0)
}

// Adapt a DB pack row (snake_case, from /api/packs) into the shape the
// hardcoded PACKS use and that applyPack consumes. form_rows already match
// the PACK*_ROWS shape because PackBuilderModal builds them via
// linesToFormRows, the exact inverse of applyPack.
function dbPackToDisplay(p) {
  return {
    id: p.id,
    label: p.label,
    description: Array.isArray(p.description) ? p.description : [],
    budget: p.budget_label || null,
    fixedTotal: p.fixed_total != null ? Number(p.fixed_total) : null,
    formRows: Array.isArray(p.form_rows) ? p.form_rows : [],
    _custom: true,
  }
}

// ─── Collapsible warnings: shows a compact summary when there are many ───
function WarningsSummary({ warnings }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useI18n()
  const count = warnings.length
  const COLLAPSE_THRESHOLD = 3

  if (count <= COLLAPSE_THRESHOLD) {
    // Few warnings -- show them inline
    return (
      <div style={{ marginBottom: 4 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ fontSize: 11, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
        ))}
      </div>
    )
  }

  // Many warnings -- show collapsed summary with expand toggle
  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
          padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#c0392b', flex: 1, textAlign: 'left' }}>
          {t('builder.warningsCount').replace('{count}', count)}
        </span>
        <span style={{ fontSize: 10, color: '#c0392b', transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {expanded && (
        <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 4, paddingLeft: 4 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: '#c0392b', marginBottom: 2 }}>! {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const CHANNEL_BANNER = {
  internal:   { label: 'Internal Order', color: '#4f46e5', bg: '#eef2ff' },
  consignment:{ label: 'Consignment',    color: '#0891b2', bg: '#ecfeff' },
  delete_from_stock: { label: 'Delete from Stock (Write-off)', color: '#dc2626', bg: '#fef2f2' },
}

export default function BuilderPage({ lines, setLines, onGenerateQuote, budget, setBudget, budgetRecommendations, showRecommendations, setShowRecommendations, onRequestRecommendations, orderChannel, pricelistYear, setPricelistYear, isAdmin = false }) {
  const mobile = useIsMobile()
  const tablet = useIsTablet()
  const { t } = useI18n()
  const [showSidebar, setShowSidebar] = useState(false)
  const mobileSafeBottom = mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' : 0
  
  // Step: 'select' (collection grid) or 'configure' (config view)
  const [step, setStep] = useState(() => {
    // If lines already have collections selected, go to configure
    return lines.some(l => l.collectionId) ? 'configure' : 'select'
  })
  const [selectedCollections, setSelectedCollections] = useState(() => {
    // Init from existing lines
    return lines.filter(l => l.collectionId).map(l => l.collectionId)
  })
  const [budgetEditing, setBudgetEditing] = useState(false)
  const budgetInputRef = useRef(null)
  const [showPacks, setShowPacks] = useState(false)
  // Custom packs the agent has saved (private) + any global packs, fetched
  // from /api/packs. Seed packs are filtered out to avoid duplicating the
  // hardcoded PACKS below.
  const [customPacks, setCustomPacks] = useState([])
  const [showPackBuilder, setShowPackBuilder] = useState(false)

  // Selection state for multi-select feature
  const [selectedConfigs, setSelectedConfigs] = useState(new Set())
  // Track recently duplicated configs for highlight effect
  const [recentlyDuplicated, setRecentlyDuplicated] = useState(new Set())

  // AI Builder Chat state
  const [showAiChat, setShowAiChat] = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pendingActions, setPendingActions] = useState(null) // Actions awaiting confirmation
  const aiChatEndRef = useRef(null)
  const aiInputRef = useRef(null)

  // Resolve once per render so every downstream getter / calculator sees the
  // same year, even if the parent passes a stale or undefined value mid-flight.
  const activePricelist = resolvePricelist(pricelistYear)

  // Load the agent's saved packs once on mount. RLS already scopes the
  // response to global packs + this user's own private packs.
  useEffect(() => {
    if (typeof fetch !== 'function') return
    let cancelled = false
    fetch('/api/packs')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.packs) return
        setCustomPacks(data.packs.filter(p => !p.is_seed).map(dbPackToDisplay))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Hardcoded quick-start packs first, then the agent's own saved packs.
  const allPacks = useMemo(() => [...PACKS, ...customPacks], [customPacks])
  // The build is saveable as a pack once at least one config has a carat set.
  const hasBuild = useMemo(
    () => lines.some(l => (l.colorConfigs || []).some(c => c.caratIdx != null)),
    [lines],
  )

  // Delete one of the agent's own saved packs. Seed/quick-start packs have no
  // delete control, and the API blocks seed deletion server-side as a backstop.
  const deletePack = useCallback(async (pack) => {
    if (!pack?._custom || !pack.id) return
    if (typeof window !== 'undefined' && !window.confirm(`Delete your pack "${pack.label}"?`)) return
    try {
      const res = await fetch(`/api/packs/${pack.id}`, { method: 'DELETE' })
      if (res.ok) setCustomPacks(prev => prev.filter(p => p.id !== pack.id))
    } catch { /* non-fatal — leave the card in place if the request fails */ }
  }, [])

  // Pending pricelist switch — set to a year string when the agent clicks the
  // other toggle button while there are non-empty lines. Confirms via modal,
  // then commits via setPricelistYear. Empty builder → silent (no modal).
  const [pendingPricelistSwitch, setPendingPricelistSwitch] = useState(null)
  const requestPricelistSwitch = useCallback((nextYear) => {
    const target = resolvePricelist(nextYear)
    if (target === activePricelist) return
    if (typeof setPricelistYear !== 'function') return
    // hasContent is computed below — we capture the current snapshot here
    // by re-checking lines synchronously to avoid a stale closure.
    const linesHaveContent = lines.some((l) => {
      if (!l.collectionId || (l.colorConfigs || []).length === 0) return false
      const c = COLLECTIONS.find((x) => x.id === l.collectionId)
      if (!c) return false
      return l.colorConfigs.some((cfg) => cfg.caratIdx !== null && cfg.caratIdx !== undefined)
    })
    if (!linesHaveContent) {
      setPricelistYear(target)
      return
    }
    setPendingPricelistSwitch(target)
  }, [activePricelist, setPricelistYear, lines])

  const confirmPricelistSwitch = useCallback(() => {
    if (pendingPricelistSwitch && typeof setPricelistYear === 'function') {
      setPricelistYear(pendingPricelistSwitch)
    }
    setPendingPricelistSwitch(null)
  }, [pendingPricelistSwitch, setPricelistYear])

  const cancelPricelistSwitch = useCallback(() => {
    setPendingPricelistSwitch(null)
  }, [])

  // Live quote
  const quote = useMemo(
    () => calculateQuote(lines, { pricelistYear: activePricelist }),
    [lines, activePricelist],
  )
  const hasContent = lines.some(l => {
    if (!l.collectionId || l.colorConfigs.length === 0) return false
    const col = COLLECTIONS.find(c => c.id === l.collectionId)
    if (!col) return false
    return l.colorConfigs.some(cfg => cfg.caratIdx !== null)
  })

  // Budget math
  const budgetNum = parseFloat(budget) || 0
  const hasBudget = budgetNum > 0
  const spent = quote.total
  const hasSpending = spent > 0
  const remaining = hasBudget ? budgetNum - spent : 0
  const pct = hasBudget ? Math.min(100, Math.round((spent / budgetNum) * 100)) : 0
  const overBudget = hasBudget && spent > budgetNum

  // Toggle collection selection
  const toggleCollection = (colId) => {
    setSelectedCollections(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [colId, ...prev]
    )
  }

  // Move from grid to configure step
  const goToConfigure = () => {
    // Create/update lines for selected collections
    setLines(prev => {
      const existingIds = prev.filter(l => l.collectionId).map(l => l.collectionId)
      const newLines = [...prev.filter(l => selectedCollections.includes(l.collectionId))]
      // Add new lines for newly selected collections
      selectedCollections.forEach(colId => {
        if (!existingIds.includes(colId)) {
          newLines.push({ uid: uniqueId(), collectionId: colId, colorConfigs: [], expanded: true })
        }
      })
      return newLines.length > 0 ? newLines : [mkLine()]
    })
    setStep('configure')
  }

  // Go back to grid
  const goToSelect = () => {
    setSelectedCollections(lines.filter(l => l.collectionId).map(l => l.collectionId))
    setStep('select')
  }

  // Update a specific line
  const updateLine = useCallback((uid, patch) => {
    setLines(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l))
  }, [setLines])

  // Remove a line
  const removeLine = useCallback((uid) => {
    let removedConfigIds = new Set()
    setLines(prev => {
      const lineToRemove = prev.find(l => l.uid === uid)
      if (lineToRemove) {
        removedConfigIds = new Set(lineToRemove.colorConfigs.map(c => c.id))
      }
      const next = prev.filter(l => l.uid !== uid)
      return next.length > 0 ? next : [mkLine()]
    })
    // Clear any selected configs from the removed line
    setSelectedConfigs(prev => {
      if (removedConfigIds.size === 0) return prev
      const next = new Set([...prev].filter(id => !removedConfigIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [setLines])

  // Toggle selection of a single config
  const toggleConfigSelection = useCallback((configId) => {
    setSelectedConfigs(prev => {
      const next = new Set(prev)
      if (next.has(configId)) {
        next.delete(configId)
      } else {
        next.add(configId)
      }
      return next
    })
  }, [])

  // Select/deselect all configs in a line
  const toggleLineSelection = useCallback((lineUid) => {
    const line = lines.find(l => l.uid === lineUid)
    if (!line) return
    const configIds = line.colorConfigs.map(c => c.id)
    setSelectedConfigs(prev => {
      const allSelected = configIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        configIds.forEach(id => next.delete(id))
      } else {
        configIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [lines])

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedConfigs(new Set())
  }, [])

  // Duplicate all selected configs
  const duplicateSelected = useCallback(() => {
    if (selectedConfigs.size === 0) return
    const newIds = new Set()
    setLines(prev => prev.map(line => {
      const selectedInLine = line.colorConfigs.filter(c => selectedConfigs.has(c.id))
      if (selectedInLine.length === 0) return line
      const copies = selectedInLine.map(cfg => {
        const newId = uniqueId()
        newIds.add(newId)
        return { ...cfg, id: newId }
      })
      return { ...line, colorConfigs: [...line.colorConfigs, ...copies] }
    }))
    // Highlight newly duplicated rows
    setRecentlyDuplicated(newIds)
    setTimeout(() => setRecentlyDuplicated(new Set()), 15000) // Clear after 15 seconds
    clearSelection()
  }, [selectedConfigs, setLines, clearSelection])

  // Get count of selected configs
  const selectedCount = selectedConfigs.size

  // Build order context string for AI
  const buildOrderContext = useCallback(() => {
    if (lines.length === 0 || !lines.some(l => l.collectionId)) {
      return 'The order is empty. No collections or items have been added yet.'
    }

    const parts = []
    lines.forEach(line => {
      if (!line.collectionId) return
      const col = COLLECTIONS.find(c => c.id === line.collectionId)
      if (!col) return
      
      parts.push(`\nCollection: ${col.label}`)
      if (line.colorConfigs.length === 0) {
        parts.push('  (no colors added yet)')
      } else {
        line.colorConfigs.forEach((cfg, idx) => {
          const caratLabel = cfg.caratIdx !== null ? col.carats[cfg.caratIdx] + 'ct' : 'no carat'
          const price = cfg.caratIdx !== null ? getPrice(col, cfg.caratIdx, cfg.certType, activePricelist) : 0
          parts.push(`  ${idx + 1}. ${cfg.colorName} | ${caratLabel} | ${cfg.housing || 'no housing'} | ${cfg.size || 'no size'} | qty:${cfg.qty} | €${price * cfg.qty}`)
        })
      }
    })

    parts.push(`\nTotal: ${quote.totalPieces} pieces, ${fmt(quote.total)}`)
    parts.push(`Price list: ${activePricelist}`)
    if (hasBudget) {
      parts.push(`Budget: ${fmt(budgetNum)}, Remaining: ${fmt(remaining)}`)
    }

    return parts.join('\n')
  }, [lines, quote, hasBudget, budgetNum, remaining, activePricelist])

  // Execute AI actions
  const executeAiActions = useCallback((actions) => {
    // Pre-generate IDs for new items so we can track them for highlighting
    const newConfigsToAdd = []
    const newCollectionIds = new Set()
    
    actions.forEach(action => {
      if (action.type === 'add') {
        const col = COLLECTIONS.find(c => 
          c.id.toLowerCase() === (action.collection || '').toLowerCase() ||
          c.label.toLowerCase() === (action.collection || '').toLowerCase()
        )
        if (!col) return

        const caratStr = String(action.carat || '').replace('ct', '')
        const caratIdx = col.carats.findIndex(c => String(c) === caratStr)
        const newId = uniqueId()
        
        // certType + closureType matter for CUTY/CUBIX — without them the
        // row will fail validation when the agent tries to save the order.
        const closureType = col.hasClosure
          ? (action.closureType === 'braided' || action.closureType === 'nonBraided' ? action.closureType : null)
          : null
        const certType = action.certType === 'igi' || action.certType === 'inhouse' ? action.certType : null
        newConfigsToAdd.push({
          collectionId: col.id,
          config: {
            id: newId,
            colorName: action.color || 'White',
            caratIdx: caratIdx >= 0 ? caratIdx : null,
            housing: action.housing || null,
            housingType: null,
            multiAttached: null,
            shape: action.shape || null,
            size: action.size || null,
            certType,
            closureType,
            qty: parseInt(action.qty) || 1,
          }
        })
        newCollectionIds.add(col.id)
      }
    })

    const newIds = new Set(newConfigsToAdd.map(item => item.config.id))
    
    setLines(prev => {
      let updated = [...prev]
      
      // Process ADD actions
      newConfigsToAdd.forEach(({ collectionId, config }) => {
        let line = updated.find(l => l.collectionId === collectionId)
        if (!line) {
          line = { uid: uniqueId(), collectionId, colorConfigs: [], expanded: true }
          updated.push(line)
        }
        updated = updated.map(l => 
          l.collectionId === collectionId 
            ? { ...l, colorConfigs: [...l.colorConfigs, config] }
            : l
        )
      })

      // Process DELETE and MODIFY actions
      actions.forEach(action => {
        if (action.type === 'delete' && action.filter) {
          updated = updated.map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return line

            const matchesCollection = !action.filter.collection || 
              col.id.toLowerCase() === action.filter.collection.toLowerCase() ||
              col.label.toLowerCase() === action.filter.collection.toLowerCase()

            if (!matchesCollection) return line

            const filteredConfigs = line.colorConfigs.filter(cfg => {
              const caratLabel = cfg.caratIdx !== null ? String(col.carats[cfg.caratIdx]) : ''

              if (action.filter.color && cfg.colorName.toLowerCase() !== action.filter.color.toLowerCase()) return true
              if (action.filter.carat && caratLabel !== String(action.filter.carat).replace('ct', '')) return true
              if (action.filter.housing && (cfg.housing || '').toLowerCase() !== action.filter.housing.toLowerCase()) return true
              if (action.filter.size && (cfg.size || '').toLowerCase() !== action.filter.size.toLowerCase()) return true
              if (action.filter.certType && (cfg.certType || '').toLowerCase() !== String(action.filter.certType).toLowerCase()) return true
              if (action.filter.closureType && (cfg.closureType || '').toLowerCase() !== String(action.filter.closureType).toLowerCase()) return true

              return false // matches filter, delete it
            })

            return { ...line, colorConfigs: filteredConfigs }
          })
        }
        
        else if (action.type === 'modify' && action.filter && action.changes) {
          updated = updated.map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return line

            const matchesCollection = !action.filter.collection || 
              col.id.toLowerCase() === action.filter.collection.toLowerCase() ||
              col.label.toLowerCase() === action.filter.collection.toLowerCase()

            if (!matchesCollection) return line

            const modifiedConfigs = line.colorConfigs.map(cfg => {
              const caratLabel = cfg.caratIdx !== null ? String(col.carats[cfg.caratIdx]) : ''
              
              // Check if this config matches the filter
              let matches = true
              if (action.filter.color && cfg.colorName.toLowerCase() !== action.filter.color.toLowerCase()) matches = false
              if (action.filter.carat && caratLabel !== String(action.filter.carat).replace('ct', '')) matches = false
              if (action.filter.housing && (cfg.housing || '').toLowerCase() !== action.filter.housing.toLowerCase()) matches = false
              if (action.filter.size && (cfg.size || '').toLowerCase() !== action.filter.size.toLowerCase()) matches = false
              if (action.filter.certType && (cfg.certType || '').toLowerCase() !== String(action.filter.certType).toLowerCase()) matches = false
              if (action.filter.closureType && (cfg.closureType || '').toLowerCase() !== String(action.filter.closureType).toLowerCase()) matches = false

              if (!matches) return cfg

              // Apply changes
              const modified = { ...cfg }
              if (action.changes.color) modified.colorName = action.changes.color
              if (action.changes.carat) {
                const newCaratIdx = col.carats.findIndex(c => String(c) === String(action.changes.carat).replace('ct', ''))
                if (newCaratIdx >= 0) modified.caratIdx = newCaratIdx
              }
              if (action.changes.housing) modified.housing = action.changes.housing
              if (action.changes.size) modified.size = action.changes.size
              if (action.changes.shape) modified.shape = action.changes.shape
              if (action.changes.certType === 'igi' || action.changes.certType === 'inhouse') {
                modified.certType = action.changes.certType
              }
              if (col.hasClosure && (action.changes.closureType === 'braided' || action.changes.closureType === 'nonBraided')) {
                modified.closureType = action.changes.closureType
              }
              if (action.changes.qty) modified.qty = parseInt(action.changes.qty) || modified.qty

              return modified
            })

            return { ...line, colorConfigs: modifiedConfigs }
          })
        }
      })

      return updated.length > 0 ? updated : [mkLine()]
    })

    if (newCollectionIds.size > 0) {
      setSelectedCollections(prev => {
        const newSet = new Set([...prev, ...newCollectionIds])
        return [...newSet]
      })
    }

    // Highlight newly added rows (the NEW ones, not the old selected ones)
    if (newIds.size > 0) {
      setRecentlyDuplicated(newIds)
      setTimeout(() => setRecentlyDuplicated(new Set()), 15000)
    }

    setPendingActions(null)
    setAiMessages(prev => [...prev, { role: 'system', content: t('builder.aiActionsApplied') || 'Actions applied successfully!' }])
  }, [setLines, setSelectedCollections, t])

  // Handle AI chat send
  const handleAiSend = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return

    const userMessage = aiInput.trim()
    setAiInput('')
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setAiLoading(true)

    try {
      const orderContext = buildOrderContext()
      const response = await sendBuilderChat(
        [...aiMessages, { role: 'user', content: userMessage }],
        orderContext,
        { pricelistYear: activePricelist },
      )

      if (response.actions && response.actions.length > 0) {
        // Show confirmation for actions
        setPendingActions(response.actions)
        setAiMessages(prev => [...prev, { 
          role: 'assistant', 
          content: response.message,
          actions: response.actions
        }])
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: response.message }])
      }
    } catch (err) {
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: t('builder.aiError') || 'Sorry, something went wrong. Please try again.'
      }])
    } finally {
      setAiLoading(false)
    }
  }, [aiInput, aiLoading, aiMessages, buildOrderContext, t, activePricelist])

  // Scroll AI chat to bottom on new messages
  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [aiMessages])

  // Focus AI input when chat opens
  useEffect(() => {
    if (showAiChat && aiInputRef.current) {
      setTimeout(() => aiInputRef.current?.focus(), 100)
    }
  }, [showAiChat])


  // Apply a standard pack (fully replaces current lines with editable prefilled configs)
  const applyPack = useCallback((pack) => {
    if (pack.formRows) {
      const byCollection = new Map()
      for (const row of pack.formRows) {
        if (!row.collection) continue
        const col = COLLECTIONS.find(c => c.label === row.collection)
        if (!col) continue
        if (!byCollection.has(col.id)) byCollection.set(col.id, [])
        byCollection.get(col.id).push(row)
      }
      const newLines = Array.from(byCollection.entries()).map(([colId, rows]) => {
        const col = COLLECTIONS.find(c => c.id === colId)
        const colorConfigs = rows.map(row => {
          const caratIdx = col.carats.findIndex(c => c === row.carat)
          let housing = row.bpColor || null
          let housingType = row.setting ? row.setting.toLowerCase() : null
          if (housingType && housing && (col.housing === 'shapyShine' || col.housing === 'matchy')) {
            housing = `${row.setting} ${housing}`
          }
          if (!housingType && housing) {
            if (housing.startsWith('Bezel ')) housingType = 'bezel'
            else if (housing.startsWith('Prong ')) housingType = 'prong'
          }
          let multiAttached = null
          if (col.housing === 'multiThree') {
            if (row.setting === 'F') multiAttached = true
            else if (row.setting === 'LO') multiAttached = false
            else if (housing) multiAttached = HOUSING.multiThree.attached.includes(housing)
          }
          return {
            id: uniqueId(),
            colorName: row.colorCord || '',
            qty: parseInt(row.quantity) || 1,
            caratIdx: caratIdx >= 0 ? caratIdx : null,
            housing,
            housingType: housingType || null,
            shape: row.shape || null,
            size: row.size || null,
            multiAttached,
            cordType: null,
            thickness: null,
            priceOverride: null,
          }
        })
        return { uid: uniqueId(), collectionId: colId, colorConfigs, expanded: true }
      })
      if (newLines.length > 0) {
        setLines(newLines)
        setSelectedCollections(newLines.map(l => l.collectionId))
        setStep('configure')
      }
      return
    }

    const newLines = pack.lines.map(packLine => {
      const col = COLLECTIONS.find(c => c.id === packLine.collectionId)
      if (!col) return null
      const palette = CORD_COLORS[col.cord] || []
      const configs = []
      palette.forEach(color => {
        packLine.caratIndices.forEach(caratIdx => {
          configs.push({
            ...mkColorConfig(color.n, col.minC || 1),
            caratIdx,
            housing: packLine.housing,
            size: packLine.size,
          })
        })
      })
      return { uid: uniqueId(), collectionId: packLine.collectionId, colorConfigs: configs, expanded: true }
    }).filter(Boolean)

    if (newLines.length > 0) {
      setLines(newLines)
      setSelectedCollections(newLines.map(l => l.collectionId))
      setStep('configure')
    }
  }, [setLines, setSelectedCollections])

  const channelBanner = CHANNEL_BANNER[orderChannel]

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Order channel context banner — shown for non-B2B orders */}
      {channelBanner && (
        <div style={{
          padding: '6px 16px', fontSize: 12, fontWeight: 600,
          color: channelBanner.color, background: channelBanner.bg,
          borderBottom: `1px solid ${channelBanner.color}22`,
          flexShrink: 0,
        }}>
          Building: {channelBanner.label}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Mobile Summary Toggle Button */}
      {mobile && (
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            position: 'fixed', bottom: mobileSafeBottom, right: 16, zIndex: 150,
            padding: '12px 20px', borderRadius: 25, border: 'none',
            background: colors.inkPlum, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(93,58,94,0.3)',
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 48,
          }}
        >
          <span>{fmt(quote.total)}</span>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{quote.totalPieces} pcs</span>
        </button>
      )}
      
      {/* Mobile Sidebar Overlay */}
      {mobile && showSidebar && (
        <div 
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200,
          }}
        />
      )}
      
      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* ─── Budget Bar ─── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #ede8f0', padding: '10px 20px', flexShrink: 0 }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {!hasBudget && !budgetEditing ? (
              <button
                onClick={() => { setBudgetEditing(true); setTimeout(() => budgetInputRef.current?.focus(), 50) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 10,
                  border: '1px dashed #ddd', background: '#fafafa',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = '#fdf7fa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fafafa' }}
              >
                <span style={{ fontSize: 14 }}>€</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Set a budget</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>Optional -- track spending & get AI recommendations</div>
                </div>
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: mobile ? 'wrap' : 'nowrap', marginBottom: hasBudget && hasSpending ? 8 : 0 }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>Budget</span>
                  <div style={{ position: 'relative', width: mobile ? 'min(160px, 60vw)' : 110, minWidth: 96 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa', fontWeight: 600 }}>€</span>
                    <input
                      ref={budgetInputRef}
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      onBlur={() => { if (!budget) setBudgetEditing(false) }}
                      placeholder="2000"
                      style={{
                        width: '100%', padding: '6px 8px 6px 22px', borderRadius: 8,
                        border: '1px solid #e3e3e3', fontSize: 13, fontFamily: 'inherit',
                        outline: 'none', background: '#fafaf8', boxSizing: 'border-box', color: '#333',
                      }}
                    />
                  </div>
                  {hasBudget && hasSpending && (
                    <>
                      <div style={{ flex: 1 }} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: overBudget ? '#c0392b' : '#27ae60' }}>
                          {overBudget ? `Over by ${fmt(spent - budgetNum)}` : `${fmt(remaining)} left`}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {fmt(spent)} / {fmt(budgetNum)} ({pct}%)
                        </div>
                      </div>
                    </>
                  )}
                  {hasBudget && !hasSpending && (
                    <span style={{ fontSize: 10, color: '#aaa', flex: mobile ? '1 1 100%' : '0 1 auto' }}>Start building to track spending</span>
                  )}
                  {hasBudget && (
                    <button
                      onClick={() => { setBudget(''); setBudgetEditing(false) }}
                      style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                      title="Clear budget"
                    >x</button>
                  )}
                </div>
                {hasBudget && hasSpending && (
                  <div style={{ height: 4, borderRadius: 2, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width .3s ease',
                      width: `${Math.min(100, pct)}%`,
                      background: overBudget ? '#c0392b' : pct > 80 ? '#e67e22' : colors.inkPlum,
                    }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Step Content ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? '16px 16px calc(env(safe-area-inset-bottom, 0px) + 98px)' : '20px 20px 32px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>

            {/* ─── Packs Collapsible ─── */}
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setShowPacks(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', borderRadius: 10,
                  border: `1px dashed ${showPacks ? colors.inkPlum : '#ccc'}`,
                  background: showPacks ? '#f5eef7' : '#fafafa',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.background = showPacks ? '#f5eef7' : '#fdf7fa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = showPacks ? colors.inkPlum : '#ccc'; e.currentTarget.style.background = showPacks ? '#f5eef7' : '#fafafa' }}
              >
                <span style={{ fontSize: 14, opacity: 0.7 }}>▤</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.inkPlum }}>Packs</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>Quick-start with a standard collection</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999', fontWeight: 600 }}>
                  {showPacks ? '▲ Close' : '▼ Browse'}
                </span>
              </button>

              {showPacks && (
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 2px 4px', scrollbarWidth: 'none' }}>
                  <button
                    type="button"
                    onClick={() => { if (hasBuild) setShowPackBuilder(true) }}
                    disabled={!hasBuild}
                    title={hasBuild ? 'Save your current build as a reusable pack' : 'Configure at least one item first'}
                    style={{
                      minWidth: 180, maxWidth: 220, flexShrink: 0,
                      border: `1.5px dashed ${hasBuild ? colors.inkPlum : '#d8d0db'}`,
                      borderRadius: 10, padding: '12px 14px',
                      background: hasBuild ? '#fdf7fa' : '#fafafa',
                      cursor: hasBuild ? 'pointer' : 'not-allowed',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 6, fontFamily: 'inherit',
                      color: hasBuild ? colors.inkPlum : '#bbb', textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Save current build</span>
                    <span style={{ fontSize: 10, color: hasBuild ? '#9a7fa8' : '#ccc' }}>
                      {hasBuild ? 'as your own pack' : 'add items first'}
                    </span>
                  </button>
                  {allPacks.map(pack => (
                    <div key={pack.id} style={{
                      minWidth: 180, maxWidth: 220, flexShrink: 0,
                      border: '1px solid #e4dded', borderRadius: 10,
                      padding: '12px 14px', background: '#fff',
                      boxShadow: '0 2px 8px rgba(93,58,94,0.07)',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: colors.inkPlum }}>
                          {pack.label}
                        </div>
                        {pack._custom && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: 0.3, color: '#9a7fa8', background: '#f5eef7',
                            borderRadius: 5, padding: '1px 5px',
                          }}>
                            Your pack
                          </span>
                        )}
                        {pack._custom && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deletePack(pack) }}
                            title="Delete this pack"
                            aria-label={`Delete pack ${pack.label}`}
                            style={{
                              marginLeft: 'auto', width: 20, height: 20, borderRadius: 5,
                              border: 'none', background: 'transparent', color: '#c9b3d1',
                              fontSize: 14, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#c9b3d1' }}
                          >×</button>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        {pack.description.map((line, i) => (
                          <div key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>· {line}</div>
                        ))}
                      </div>
                      {pack.budget && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9a7fa8' }}>
                            {pack.budget}
                          </div>
                          <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
                            Total order: {pack.fixedTotal != null ? '' : '~'}€{computePackTotal(pack, activePricelist).toLocaleString('fr-FR')}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { applyPack(pack); setShowPacks(false) }}
                        style={{
                          marginTop: 10, width: '100%', padding: '6px 0',
                          borderRadius: 8, border: `1.5px solid ${colors.inkPlum}`,
                          background: colors.inkPlum, color: '#fff', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'opacity .1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                      >
                        Use this pack
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {step === 'select' ? (
              /* ═══ STEP 1: Collection Selection Grid ═══ */
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 3px', fontFamily: fonts.body }}>
                    {t('builder.selectCollections')}
                  </h2>
                  <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
                    {t('builder.selectCollectionsHelp')}
                  </p>
                </div>

                {/* Collection Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${tablet ? '150px' : '185px'}, 1fr))`,
                  gap: 10,
                  marginBottom: 24,
                }}>
                  {[
                    ...selectedCollections.map(id => COLLECTIONS.find(c => c.id === id)).filter(Boolean),
                    ...COLLECTIONS.filter(c => !selectedCollections.includes(c.id)),
                  ].map(col => {
                    const isSelected = selectedCollections.includes(col.id)
                    const defaultCert = getDefaultCert(col)
                    const priceMin = `€${getPrice(col, 0, defaultCert, activePricelist)}`
                    const priceMax = col.carats.length > 1 ? ` – €${getPrice(col, col.carats.length - 1, defaultCert, activePricelist)}` : ''
                    const cordType = CORD_TYPE_LABELS[col.cord] || col.cord

                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleCollection(col.id)}
                        style={{
                          position: 'relative',
                          padding: '14px 14px 12px',
                          borderRadius: 12,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '1px solid #ede8f0',
                          background: isSelected ? '#fdf7fa' : '#fdfdfd',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          transition: 'all .15s',
                          boxShadow: isSelected ? `0 2px 12px ${colors.inkPlum}12` : '0 1px 3px rgba(0,0,0,0.03)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = colors.inkPlum + '55'
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(93,58,94,0.08)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#ede8f0'
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
                          }
                        }}
                      >
                        {/* Selection indicator */}
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          width: 20, height: 20, borderRadius: 6,
                          border: isSelected ? `2px solid ${colors.inkPlum}` : '1.5px solid #d8d0e0',
                          background: isSelected ? colors.inkPlum : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s',
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>

                        {/* Product photo */}
                        {(() => {
                          const thumbUrl = col.id === 'SSPF'
                            ? findPackshot(col.id)
                            : findPackshot(col.id, { color: 'Bordeaux' })
                          return thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={col.label}
                              loading="lazy"
                              style={{
                                width: '100%', height: 120,
                                objectFit: 'contain',
                                marginBottom: 8,
                                borderRadius: 6,
                                background: '#faf8fc',
                              }}
                            />
                          ) : null
                        })()}

                        {/* Collection name */}
                        <div style={{
                          fontSize: 14, fontWeight: 700,
                          color: isSelected ? colors.inkPlum : '#2a2a2a',
                          marginBottom: 6, paddingRight: 28, lineHeight: 1.3,
                        }}>
                          {col.label}
                        </div>

                        {/* Price range — prominent */}
                        <div style={{
                          fontSize: 13, fontWeight: 600,
                          color: isSelected ? colors.inkPlum : '#444',
                          marginBottom: 8,
                        }}>
                          {priceMin}{priceMax}
                          <span style={{ fontWeight: 400, fontSize: 11, color: '#aaa' }}> /pc</span>
                        </div>

                        {/* Cord type pill */}
                        <div style={{
                          display: 'inline-block',
                          fontSize: 10, fontWeight: 500,
                          color: isSelected ? colors.inkPlum : '#888',
                          background: isSelected ? `${colors.inkPlum}12` : '#f0ecf5',
                          borderRadius: 20, padding: '2px 8px',
                        }}>
                          {cordType}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Bottom action */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    {selectedCollections.length === 0 ? (
                      t('builder.selectAtLeastOne')
                    ) : (
                      <span>
                        <strong style={{ color: colors.inkPlum }}>
                          {t('builder.collectionsSelected').replace('{count}', selectedCollections.length)}
                        </strong>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={goToConfigure}
                    disabled={selectedCollections.length === 0}
                    style={{
                      ...btnPrimary,
                      opacity: selectedCollections.length === 0 ? 0.4 : 1,
                      cursor: selectedCollections.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    {t('builder.continueConfig')} →
                  </button>
                </div>
              </div>
            ) : (
              /* ═══ STEP 2: Configuration View ═══ */
              <div>
                <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 10 : 0, marginBottom: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.inkPlum, margin: '0 0 3px', fontFamily: fonts.body }}>
                      {t('builder.configureOrder')}
                    </h2>
                    <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
                      {t('builder.configureOrderHelp')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: mobile ? 'flex-start' : 'flex-end' }}>
                    {/* ─── Pricelist toggle (2025 / 2026) ─── */}
                    {/* Wraps in a fieldset for screen-reader semantics: a clear
                        radiogroup label avoids confusing AT users who
                        otherwise hear two unconnected buttons. */}
                    <fieldset
                      data-testid="pricelist-toggle"
                      aria-label="Active price list"
                      title="Choose 2025 for legacy clients still on the old pricing during the 6-month transition. New clients use 2026."
                      style={{
                        display: 'inline-flex', border: '1px solid #ddd',
                        borderRadius: 8, padding: 0, margin: 0, gap: 0,
                        background: '#fafafa',
                      }}
                    >
                      <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                        Active price list
                      </legend>
                      {PRICELISTS.map((year) => {
                        const isActive = activePricelist === year
                        return (
                          <button
                            key={year}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            data-testid={`pricelist-toggle-${year}`}
                            onClick={() => requestPricelistSwitch(year)}
                            style={{
                              padding: '7px 12px', fontSize: 11, fontWeight: 700,
                              border: 'none',
                              borderRadius: 7,
                              background: isActive ? colors.inkPlum : 'transparent',
                              color: isActive ? '#fff' : '#666',
                              cursor: isActive ? 'default' : 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all .12s',
                            }}
                          >
                            {PRICELIST_LABELS[year] || `${year} prices`}
                          </button>
                        )
                      })}
                    </fieldset>
                    {/* Collapse / Expand all */}
                    {(() => {
                      const allExpanded = lines.filter(l => l.collectionId).every(l => l.expanded !== false)
                      return (
                        <button
                          onClick={() => setLines(prev => prev.map(l => ({ ...l, expanded: !allExpanded })))}
                          style={{
                            padding: '7px 12px', fontSize: 11, fontWeight: 600,
                            borderRadius: 8, border: '1px solid #ddd',
                            background: '#fafafa', color: '#666',
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'all .12s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum + '80'; e.currentTarget.style.color = colors.inkPlum }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#666' }}
                        >
                          {allExpanded ? '↑ Collapse all' : '↓ Expand all'}
                        </button>
                      )
                    })()}
                    {/* AI Advisor Button */}
                    <button
                      onClick={() => setShowAiChat(v => !v)}
                      style={{
                        padding: '8px 14px', fontSize: 12, fontWeight: 700,
                        borderRadius: 10,
                        border: showAiChat ? 'none' : `1.5px solid ${colors.inkPlum}`,
                        background: showAiChat ? colors.inkPlum : '#fff',
                        color: showAiChat ? '#fff' : colors.inkPlum,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all .15s',
                      }}
                    >
                      ✨ {t('builder.aiAdvisor') || 'AI Advisor'}
                    </button>
                    <button onClick={goToSelect} style={btnGhost}>
                      ← {t('builder.editCollections')}
                    </button>
                  </div>
                </div>

                {/* Collection config panels */}
                {lines.filter(l => l.collectionId).map(line => {
                  const col = COLLECTIONS.find(c => c.id === line.collectionId)
                  if (!col) return null
                  return (
                    <CollectionConfig
                      key={line.uid}
                      line={line}
                      col={col}
                      onChange={updateLine}
                      onRemove={removeLine}
                      selectedConfigs={selectedConfigs}
                      onToggleConfigSelect={toggleConfigSelection}
                      onToggleLineSelect={toggleLineSelection}
                      recentlyDuplicated={recentlyDuplicated}
                      pricelistYear={activePricelist}
                    />
                  )
                })}

                {/* Add another collection quick action */}
                <button
                  onClick={goToSelect}
                  style={{
                    width: '100%', padding: 12, borderRadius: 10,
                    border: '1.5px dashed #d0d0d0', background: 'transparent',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: '#888', fontFamily: 'inherit', marginBottom: 16,
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.inkPlum; e.currentTarget.style.color = colors.inkPlum }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d0d0d0'; e.currentTarget.style.color = '#888' }}
                >
                  + {t('builder.addMoreCollections')}
                </button>

                {/* Floating Selection Action Bar */}
                {selectedCount > 0 && (
                  <div style={{
                    position: 'sticky', bottom: 0, left: 0, right: 0,
                    background: '#fff', borderRadius: 12, marginBottom: 12,
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                    border: `1px solid ${colors.inkPlum}30`,
                    zIndex: 50, overflow: 'hidden',
                  }}>
                    {/* Main bar */}
                    <div style={{
                      padding: '12px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: colors.inkPlum, color: '#fff',
                          fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selectedCount}
                        </span>
                        <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>
                          {t('builder.itemsSelected').replace('{count}', selectedCount)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={clearSelection}
                          style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: '1px solid #e0e0e0', background: '#fff',
                            color: '#666', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {t('common.clear')}
                        </button>
                        <button
                          onClick={() => duplicateSelected()}
                          style={{
                            padding: '8px 16px', borderRadius: 8,
                            border: `1px solid ${colors.inkPlum}`, background: '#fff',
                            color: colors.inkPlum, fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {t('builder.duplicateSelected')}
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {/* AI Recommendations Panel */}
                {showRecommendations && budgetRecommendations && (
                  <div style={{
                    marginBottom: 14, borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${colors.inkPlum}22`, background: '#fdf7fa',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: `1px solid ${colors.inkPlum}15`,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.inkPlum }}>{t('builder.aiRecommendations')}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{t('builder.remainingBudget').replace('{amount}', fmt(remaining))}</div>
                      </div>
                      <button onClick={() => setShowRecommendations(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 16, cursor: 'pointer' }}>x</button>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      {budgetRecommendations.loading ? (
                        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: '#999' }}>{t('builder.thinking')}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{budgetRecommendations.message}</div>
                      )}
                    </div>
                    {!budgetRecommendations.loading && (
                      <div style={{ padding: '8px 14px 10px', borderTop: '1px solid #f0e8ee', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={onRequestRecommendations} style={{ ...btnSecondary, padding: '6px 14px', fontSize: 11 }}>{t('builder.regenerate')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Order Summary Sidebar ═══
          Narrower on desktop than the original 280px so the Configure Order
          table to the left of it gets enough room on 13"-14" Windows
          laptops (mom's machine) without forcing horizontal scroll inside
          the per-collection rows. Still wide enough to show:
            COLLECTION · n colors · n pcs        XX €
      */}
      <div style={{
        width: mobile ? '85%' : tablet ? 220 : 220,
        maxWidth: mobile ? 320 : tablet ? 220 : 220,
        flexShrink: 0,
        background: '#fff',
        borderLeft: '1px solid #eaeaea',
        display: mobile && !showSidebar ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Mobile slide-in styles
        ...(mobile ? {
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 210,
          transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        } : {}),
      }}>
        {/* Mobile close button */}
        {mobile && (
          <button
            onClick={() => setShowSidebar(false)}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 1,
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: '#f0f0f0', color: '#666', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        )}
        <div style={{ padding: '20px 12px 12px', borderBottom: '1px solid #eaeaea' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, marginBottom: 2 }}>{t('builder.orderSummary')}</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {quote.totalPieces > 0 ? t('builder.piecesCount').replace('{count}', quote.totalPieces) : t('builder.noItemsYet')}
          </div>
        </div>

        {/* Per-collection breakdown — gap: 8 + tighter horizontal padding so
            the collection name and total never collide on a 220px sidebar. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {lines.filter(l => l.collectionId && l.colorConfigs.length > 0).map(line => {
            const col = COLLECTIONS.find(c => c.id === line.collectionId)
            if (!col) return null
            const lineTotal = line.colorConfigs.reduce((sum, cfg) => {
              const price = cfg.caratIdx !== null ? getPrice(col, cfg.caratIdx, cfg.certType, activePricelist) : 0
              return sum + (cfg.qty * price)
            }, 0)
            const pieces = line.colorConfigs.reduce((sum, cfg) => sum + cfg.qty, 0)
            if (pieces === 0 && lineTotal === 0) return null
            return (
              <div key={line.uid} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</div>
                  <div style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('builder.colorsPcs').replace('{colors}', line.colorConfigs.length).replace('{pieces}', pieces)}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#333', flexShrink: 0 }}>{fmt(lineTotal)}</div>
              </div>
            )
          })}
          {quote.totalPieces === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: '#ccc' }}>
              {t('builder.addColorsToSeeTotals')}
            </div>
          )}
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid #eaeaea', padding: '12px', maxHeight: '45vh', overflowY: 'auto' }}>
          {quote.discountPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>{t('quote.discount')} ({quote.discountPercent}%)</span>
              <span style={{ color: '#27ae60', fontWeight: 600 }}>-{fmt(quote.discountAmount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{t('quote.total')}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: colors.inkPlum }}>{fmt(quote.total)}</span>
          </div>
          {quote.totalPieces > 0 && (
            <div style={{ fontSize: 11, color: '#999', textAlign: 'right', marginBottom: 8 }}>
              {t('builder.retailValue')}: {fmt(quote.totalRetail)}
            </div>
          )}

          {/* Warnings -- collapsed when more than 3 */}
          {quote.warnings.length > 0 && (
            <WarningsSummary warnings={quote.warnings} />
          )}

          {hasBudget && hasSpending && (
            <div style={{
              fontSize: 11, padding: '6px 0', marginBottom: 8,
              color: overBudget ? '#c0392b' : '#27ae60', fontWeight: 600,
            }}>
              {overBudget ? t('builder.overBudgetBy').replace('{amount}', fmt(spent - budgetNum)) : t('builder.remainingAmount').replace('{amount}', fmt(remaining))}
            </div>
          )}

          {/* Generate Quote */}
          <button
            onClick={() => hasContent && onGenerateQuote(quote)}
            disabled={!hasContent}
            style={{
              ...btnPrimary, width: '100%', textAlign: 'center',
              opacity: hasContent ? 1 : 0.4,
              cursor: hasContent ? 'pointer' : 'default',
              marginBottom: 6,
            }}
          >
            {t('builder.generateQuote')}
          </button>

          {/* Budget recommend */}
          {hasBudget && hasSpending && remaining > 0 && (
            <button
              onClick={onRequestRecommendations}
              disabled={budgetRecommendations?.loading}
              style={{
                ...btnSecondary, width: '100%', textAlign: 'center',
                padding: '8px 16px', fontSize: 11,
                opacity: budgetRecommendations?.loading ? 0.6 : 1,
              }}
            >
              {budgetRecommendations?.loading ? t('builder.thinking') : t('builder.suggestForLeft').replace('{amount}', fmt(remaining))}
            </button>
          )}
        </div>
      </div>

      {/* ═══ AI Builder Chat Panel ═══ */}
      {step === 'configure' && (
        <>
          {/* AI Chat Panel */}
          {showAiChat && (
            <div style={{
              position: 'fixed',
              bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 74px)' : 24,
              right: 24,
              width: mobile ? 'calc(100% - 48px)' : 380,
              maxWidth: 420,
              maxHeight: mobile ? 'calc(100vh - 140px)' : '70vh',
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
              border: `1px solid ${colors.lineGray}`,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 150,
            }}>
              {/* Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${colors.lineGray}`,
                background: `linear-gradient(135deg, ${colors.inkPlum}08 0%, #7c3aed08 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.inkPlum, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ✨ {t('builder.aiAdvisor') || 'AI Advisor'}
                  </div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                    {t('builder.aiAdvisorDesc') || 'Ask questions or request changes to your order'}
                  </div>
                </div>
                <button
                  onClick={() => setShowAiChat(false)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: 'none', background: '#f0f0f0', color: '#666',
                    fontSize: 14, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >×</button>
              </div>

              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 200,
              }}>
                {aiMessages.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '30px 16px',
                    color: '#999',
                    fontSize: 12,
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                    <div>{t('builder.aiWelcome') || 'Ask me anything about your order!'}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: '#bbb' }}>
                      {t('builder.aiExamples') || 'Examples: "Add 5 CUTY White 0.10ct", "Delete all Black colors", "Change all 0.05ct to 0.10ct"'}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    }}
                  >
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' 
                        ? colors.inkPlum 
                        : msg.role === 'system' 
                          ? '#e8f5e9'
                          : '#f5f5f5',
                      color: msg.role === 'user' ? '#fff' : '#333',
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                    </div>
                    
                    {/* Action badges */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {msg.actions.map((action, aIdx) => (
                          <span
                            key={aIdx}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 12,
                              fontSize: 10,
                              fontWeight: 600,
                              background: action.type === 'add' ? '#e3f2fd' : 
                                         action.type === 'delete' ? '#ffebee' : '#fff3e0',
                              color: action.type === 'add' ? '#1565c0' :
                                    action.type === 'delete' ? '#c62828' : '#ef6c00',
                            }}
                          >
                            {action.type.toUpperCase()}: {action.collection || action.filter?.collection || '?'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {aiLoading && (
                  <div style={{
                    alignSelf: 'flex-start',
                    padding: '10px 14px',
                    borderRadius: '16px 16px 16px 4px',
                    background: '#f5f5f5',
                    fontSize: 13,
                    color: '#999',
                  }}>
                    <span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>
                      {t('builder.aiThinking') || 'Thinking...'}
                    </span>
                  </div>
                )}

                <div ref={aiChatEndRef} />
              </div>

              {/* Pending Actions Confirmation */}
              {pendingActions && pendingActions.length > 0 && (
                <div style={{
                  padding: 12,
                  borderTop: `1px solid ${colors.lineGray}`,
                  background: '#fffde7',
                  maxHeight: '50vh',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#f57c00', marginBottom: 8, flexShrink: 0 }}>
                    {t('builder.aiConfirmActions') || 'Confirm actions:'} ({pendingActions.length})
                  </div>
                  <div style={{ 
                    display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10,
                    overflowY: 'auto', maxHeight: '30vh', flexShrink: 1,
                  }}>
                    {pendingActions.map((action, idx) => (
                      <div key={idx} style={{
                        padding: '6px 10px',
                        background: '#fff',
                        borderRadius: 6,
                        fontSize: 11,
                        border: '1px solid #ffe082',
                        flexShrink: 0,
                      }}>
                        <strong>{action.type.toUpperCase()}</strong>
                        {action.type === 'add' && `: ${action.qty || 1}x ${action.collection} ${action.color} ${action.carat || ''}`}
                        {action.type === 'delete' && `: ${action.filter?.collection || 'items'} ${action.filter?.color || ''} ${action.filter?.carat || ''}`}
                        {action.type === 'modify' && `: ${action.filter?.collection || 'items'} → ${Object.entries(action.changes || {}).map(([k, v]) => `${k}=${v}`).join(', ')}`}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => executeAiActions(pendingActions)}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: 8,
                        border: 'none', background: '#4caf50', color: '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('builder.aiApply') || 'Apply Changes'}
                    </button>
                    <button
                      onClick={() => {
                        setPendingActions(null)
                        setAiMessages(prev => [...prev, { role: 'system', content: t('builder.aiCancelled') || 'Actions cancelled.' }])
                      }}
                      style={{
                        padding: '10px 16px', borderRadius: 8,
                        border: '1px solid #ddd', background: '#fff', color: '#666',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('common.cancel') || 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              {/* Input */}
              <div style={{
                padding: 12,
                borderTop: `1px solid ${colors.lineGray}`,
                display: 'flex',
                gap: 8,
              }}>
                <input
                  ref={aiInputRef}
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
                  placeholder={t('builder.aiPlaceholder') || 'Ask or give a command...'}
                  disabled={aiLoading}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 20,
                    border: '1px solid #e0e0e0',
                    fontSize: 13,
                    fontFamily: fonts.body,
                    outline: 'none',
                    background: aiLoading ? '#f5f5f5' : '#fff',
                  }}
                />
                <button
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiInput.trim()}
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: 'none',
                    background: aiLoading || !aiInput.trim() ? '#e0e0e0' : colors.inkPlum,
                    color: '#fff',
                    fontSize: 16,
                    cursor: aiLoading || !aiInput.trim() ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          )}
        </>
      )}

      </div>

      <PackBuilderModal
        open={showPackBuilder}
        onClose={() => setShowPackBuilder(false)}
        lines={lines}
        pricelistYear={activePricelist}
        isAdmin={isAdmin}
        onSaved={(pack) => { if (pack) setCustomPacks(prev => [...prev, dbPackToDisplay(pack)]) }}
      />

      {/* Pricelist switch confirmation — only mounts when a switch is pending */}
      {pendingPricelistSwitch && (
        <div
          data-testid="pricelist-switch-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pricelist-switch-title"
          onClick={cancelPricelistSwitch}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 600, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: '20px 22px',
              maxWidth: 440, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              fontFamily: fonts.body,
            }}
          >
            <h3 id="pricelist-switch-title" style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum, margin: '0 0 10px' }}>
              Switch to {PRICELIST_LABELS[pendingPricelistSwitch] || pendingPricelistSwitch}?
            </h3>
            <p style={{ fontSize: 13, color: '#444', lineHeight: 1.55, margin: '0 0 18px' }}>
              This will re-price every line in the builder. Lines with manual price overrides will keep their overrides. Continue?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                data-testid="pricelist-switch-cancel"
                onClick={cancelPricelistSwitch}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600,
                  borderRadius: 8, border: '1px solid #ddd',
                  background: '#fff', color: '#666', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="pricelist-switch-confirm"
                onClick={confirmPricelistSwitch}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 700,
                  borderRadius: 8, border: 'none',
                  background: colors.inkPlum, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
