'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'
import { isSynaliaAgentEmail } from '@/lib/jewelerGroup'
import { publicAssetHref } from '@/lib/publicAssetHref'
import SendResourcesModal from './SendResourcesModal'

const DRIVE_URL = 'https://drive.google.com/drive/folders/16T6-ib-cB53zpftAYn47-sx8FCJuhNhg?usp=sharing'

const FRENCH_CATALOGUES = [
  {
    id: 'fr-general-sept',
    label: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    fileName: 'Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPPy7GKXc/fzRUgvGrbqq5jf1DJ_DcTQ/view?embed',
    audience: 'nicolas',
    period: 'September',
  },
  {
    id: 'fr-bijorka-sept',
    label: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    fileName: 'Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Sept Fr LoveLab B2B Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPPw_T2xI/Z_Tyy6Lp6OWkBRy1x5dCOg/view?embed',
    audience: 'nicolas',
    period: 'September',
  },
  {
    id: 'fr-premiere-france-oct',
    label: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    fileName: '_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/_Oct FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAG8QTSZGDA/00BwwxPy9ZTg_g18XWm9EQ/view?embed',
    audience: 'admin',
    period: 'October',
  },
  {
    id: 'fr-premiere-general-oct',
    label: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    fileName: 'Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Francais/Oct FR_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPP8Z87Jw/ke6GNZN7sohPEteltgMNQw/view?embed',
    audience: 'admin',
    period: 'October',
  },
]

const STANDARD_CATALOGUES = [
  {
    id: 'en',
    label: 'English',
    fileName: 'EN_LoveLab_B2B_Catalogue.pdf',
    pdf: '/catalogues/English/EN_LoveLab_B2B_Catalogue.pdf',
    canva: 'https://www.canva.com/design/DAG96CBWaMA/H62MROtgbWLqbfqQLMI7cQ/view?embed',
  },
  {
    id: 'en-oct',
    label: 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    fileName: 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    documentName: 'Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    pdf: '/catalogues/English/Oct EN_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAHPRGqBzAM/SfktKLBglSZg6NRcaJUVPQ/view?embed',
  },
  {
    id: 'de',
    label: 'Deutsch',
    fileName: 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    documentName: 'Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    pdf: '/catalogues/Oct DE_LoveLab_B2B_Catalogue General (210 x 210 mm).pdf',
    canva: 'https://www.canva.com/design/DAG_PqDSDhQ/K2FvRij-94kg6L0eD9oCgQ/view?embed',
  },
]

const CATALOGUE_FILES = [
  ...FRENCH_CATALOGUES.map(({ fileName, pdf }) => ({ name: fileName, path: pdf })),
  ...STANDARD_CATALOGUES.map(({ label, fileName, documentName, pdf }) => ({
    name: documentName || `${label} — LoveLab B2B Catalogue.pdf`,
    fileName,
    path: pdf,
  })),
]

// Pack order templates are now generated per pack and served from
// /api/pack-templates (see lib/packTemplates.js). The Packs folder fetches
// them dynamically so filenames always track the pack's current label.

const PRICE_LIST_FILES = [
  { name: 'Pricelist_LoveLab_2025.pdf', path: '/Price Lists/Pricelist_LoveLab_2025.pdf' },
  { name: 'Pricelist_LoveLab_2026.pdf', path: '/Price Lists/Pricelist_LoveLab_2026.pdf' },
]

const EAN_FILES = [
  { name: 'Final-GS1-Code.xlsx', path: '/Ean Codes/Final-GS1-Code.xlsx' },
]

// Controlled folder: selection state lives in the parent so a single email
// can bundle picks from Catalogue + Packs + Price List together.
function DownloadFolder({ label, files, selected, onToggle }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 14px', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: fonts.body, background: '#fff',
          color: colors.inkPlum, border: `1px solid ${colors.inkPlum}`,
          textAlign: 'left', transition: 'opacity .12s',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {open
            ? <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></>
            : <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          }
        </svg>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ marginTop: 6, marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map(f => {
            const isChecked = selected.has(f.path)
            return (
              <div
                key={f.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 7, fontSize: 12,
                  fontWeight: 500, color: colors.inkPlum, fontFamily: fonts.body,
                  background: isChecked ? '#ece4f3' : '#f3f0f8',
                  border: `1px solid ${isChecked ? colors.inkPlum + '55' : colors.inkPlum + '18'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(f.path)}
                  aria-label={`Select ${f.name}`}
                  style={{ accentColor: colors.inkPlum, cursor: 'pointer', flexShrink: 0 }}
                />
                <a
                  href={publicAssetHref(f.path)}
                  download={f.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, flex: 1,
                    color: colors.inkPlum, textDecoration: 'none', minWidth: 0,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LinkButton({ href, children, variant = 'outline' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', fontFamily: fonts.body,
    transition: 'opacity .12s',
  }
  const styles = variant === 'solid'
    ? { ...base, background: colors.inkPlum, color: '#fff', border: 'none' }
    : { ...base, background: '#fff', color: colors.inkPlum, border: `1px solid ${colors.inkPlum}` }
  return (
    <a href={href} target="_blank" rel="noreferrer" style={styles}>
      {children}
    </a>
  )
}

export default function ResourcesCard({ isAdmin = false, userEmail }) {
  const { lang, t } = useI18n()
  const isNicolas = isSynaliaAgentEmail(userEmail)
  const visibleFrenchCatalogues = useMemo(() => (
    isAdmin
      ? FRENCH_CATALOGUES
      : isNicolas
        ? FRENCH_CATALOGUES.filter((cat) => cat.audience === 'nicolas')
        : []
  ), [isAdmin, isNicolas])
  const standardDefault = STANDARD_CATALOGUES.find((cat) => cat.id === lang) || STANDARD_CATALOGUES[0]
  const previewCatalogues = useMemo(
    () => [...visibleFrenchCatalogues, ...STANDARD_CATALOGUES],
    [visibleFrenchCatalogues],
  )
  const defaultPreviewCatalogue = visibleFrenchCatalogues[0] || standardDefault
  const [selectedPreviewId, setSelectedPreviewId] = useState(defaultPreviewCatalogue.id)
  const selectedPreviewCatalogue = previewCatalogues.find((cat) => cat.id === selectedPreviewId) || defaultPreviewCatalogue

  useEffect(() => {
    if (!previewCatalogues.some((cat) => cat.id === selectedPreviewId)) {
      setSelectedPreviewId(defaultPreviewCatalogue.id)
    }
  }, [selectedPreviewId, defaultPreviewCatalogue.id, previewCatalogues])

  // Selection is lifted here so a single email can bundle picks from
  // Catalogue + Packs + Price List together.
  const [selected, setSelected] = useState(() => new Set())
  const [modalOpen, setModalOpen] = useState(false)

  // Pack order templates are generated per pack and listed dynamically, so the
  // filenames always reflect each pack's current label (admin only).
  const [packsFiles, setPacksFiles] = useState([])
  useEffect(() => {
    if (!isAdmin || typeof fetch !== 'function') return
    let cancelled = false
    fetch('/api/pack-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        if (cancelled) return
        const files = (d.templates || []).map((t) => ({ name: t.fileName, path: t.downloadUrl }))
        setPacksFiles(files)
      })
      .catch(() => { if (!cancelled) setPacksFiles([]) })
    return () => { cancelled = true }
  }, [isAdmin])

  const toggle = (path) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Flatten all folders into a single lookup so we can resolve selected paths
  // back to {name, path} regardless of which folder they came from.
  const allFiles = [...CATALOGUE_FILES, ...packsFiles, ...PRICE_LIST_FILES, ...EAN_FILES]
  const selectedFiles = allFiles.filter(f => selected.has(f.path))
  const count = selectedFiles.length
  const sendLabel = count === 1
    ? t('resources.sendByEmail', { count })
    : t('resources.sendByEmailPlural', { count })

  // Build a human-readable "where these came from" string for the modal subtitle.
  const folderLabels = []
  if (selectedFiles.some(f => CATALOGUE_FILES.includes(f))) folderLabels.push(t('resources.catalogue'))
  if (selectedFiles.some(f => packsFiles.includes(f)))      folderLabels.push(t('resources.packs'))
  if (selectedFiles.some(f => PRICE_LIST_FILES.includes(f))) folderLabels.push(t('resources.priceList'))
  if (selectedFiles.some(f => EAN_FILES.includes(f)))       folderLabels.push(t('resources.eanCodes'))
  const folderSummary = folderLabels.join(' · ')

  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: `1px solid ${colors.lineGray}`,
      overflow: 'hidden', marginBottom: 0,
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${colors.lineGray}`,
        fontSize: 11, fontWeight: 700, color: colors.lovelabMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
        Resources & Quick Links
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Relevant Links */}
        <div style={{
          background: '#faf8fc', borderRadius: 12,
          padding: '20px 22px', border: `1px solid ${colors.lineGray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 26 }}>🔗</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>Relevant Links</div>
              <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 2 }}>Photos, tools, and quick access</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LinkButton href={DRIVE_URL} variant="outline">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Open Google Drive
            </LinkButton>
            <LinkButton href="https://www.lovelab.be" variant="outline">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
              </svg>
              lovelab.be
            </LinkButton>
            <LinkButton href="https://www.instagram.com/lovelab_antwerp" variant="outline">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
              @lovelab_antwerp
            </LinkButton>
            {isAdmin && (
              <LinkButton href="https://software.love-lab.com/login" variant="outline">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
                Internal Software
              </LinkButton>
            )}
            {isAdmin && (
              <div style={{
                marginTop: 6, paddingTop: 12,
                borderTop: `1px dashed ${colors.inkPlum}30`,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: colors.lovelabMuted,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {t('resources.documents')}
                </div>
                <DownloadFolder label={t('resources.catalogue')} files={CATALOGUE_FILES} selected={selected} onToggle={toggle} />
                <DownloadFolder label={t('resources.packs')}     files={packsFiles}      selected={selected} onToggle={toggle} />
                <DownloadFolder label={t('resources.priceList')} files={PRICE_LIST_FILES} selected={selected} onToggle={toggle} />
                <DownloadFolder label={t('resources.eanCodes')}  files={EAN_FILES}        selected={selected} onToggle={toggle} />

                {count > 0 && (
                  <button
                    onClick={() => setModalOpen(true)}
                    style={{
                      marginTop: 8, padding: '10px 14px', borderRadius: 8,
                      fontSize: 13, fontWeight: 700, fontFamily: fonts.body,
                      background: colors.inkPlum, color: '#fff',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {sendLabel}
                  </button>
                )}

                <SendResourcesModal
                  open={modalOpen}
                  onClose={() => { setModalOpen(false); setSelected(new Set()) }}
                  files={selectedFiles}
                  folderLabel={folderSummary}
                />
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Catalogue preview — selected Canva demo + matching local PDF */}
      <div style={{ borderTop: `1px solid ${colors.lineGray}`, padding: '0 24px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          padding: '16px 0 14px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 700, color: colors.lovelabMuted,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Catalogue Preview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <label htmlFor="catalogue-preview-selector" style={{ fontSize: 10, color: '#777', fontWeight: 600 }}>
              Choose catalogue:
            </label>
            <select
              id="catalogue-preview-selector"
              aria-label="Catalogue preview"
              value={selectedPreviewCatalogue.id}
              onChange={(e) => setSelectedPreviewId(e.target.value)}
              style={{
                maxWidth: 300, padding: '5px 8px', borderRadius: 5,
                border: `1px solid ${colors.inkPlum}35`, background: '#faf8fc',
                color: colors.inkPlum, fontFamily: fonts.body, fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {previewCatalogues.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
            <a
              href={publicAssetHref(selectedPreviewCatalogue.pdf)}
              download={selectedPreviewCatalogue.fileName}
              style={{
                fontSize: 10, fontWeight: 700, color: colors.inkPlum, textDecoration: 'none',
                padding: '5px 8px', borderRadius: 5, border: `1px solid ${colors.inkPlum}25`,
                background: '#faf8fc', fontFamily: fonts.body, lineHeight: 1,
              }}
            >
              Download PDF
            </a>
          </div>
        </div>
        <div style={{
          position: 'relative', width: '100%', paddingTop: '70%',
          borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${colors.lineGray}`,
          background: '#f5f5f5',
        }}>
          <iframe
            key={selectedPreviewCatalogue.id}
            src={selectedPreviewCatalogue.canva}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              border: 'none',
            }}
            loading="lazy"
            allowFullScreen
            title={`Catalogue preview: ${selectedPreviewCatalogue.label}`}
          />
        </div>
      </div>
    </div>
  )
}
