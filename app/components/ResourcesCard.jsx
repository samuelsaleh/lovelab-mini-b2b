'use client'

import { colors, fonts } from '@/lib/styles'
import { useI18n } from '@/lib/i18n'

const DRIVE_URL = 'https://drive.google.com/drive/folders/16T6-ib-cB53zpftAYn47-sx8FCJuhNhg?usp=sharing'

const CATALOGUES = [
  {
    lang: 'FR',
    label: 'Français',
    canva: 'https://www.canva.com/design/DAG8QTSZGDA/00BwwxPy9ZTg_g18XWm9EQ/view?utm_content=DAG8QTSZGDA&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h24deb22c81',
    pdf: '/catalogues/_FR_LoveLab_B2B_Catalogue (210 x 210 mm).pdf',
  },
  {
    lang: 'EN',
    label: 'English',
    canva: 'https://www.canva.com/design/DAG96CBWaMA/H62MROtgbWLqbfqQLMI7cQ/view?utm_content=DAG96CBWaMA&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=ha3c6d14fc6',
    pdf: '/catalogues/EN_LoveLab_B2B_Catalogue.pdf',
  },
  {
    lang: 'DE',
    label: 'Deutsch',
    canva: 'https://www.canva.com/design/DAG_PqDSDhQ/K2FvRij-94kg6L0eD9oCgQ/view?utm_content=DAG_PqDSDhQ&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h07aaa4d7fd',
    pdf: '/catalogues/DE_LoveLab_B2B_Catalogue.pdf',
  },
]

// Canva embed URLs by portal language (append ?embed for the embeddable version).
// Italian and any other language fall back to English.
const CANVA_EMBED_BY_LANG = {
  fr: 'https://www.canva.com/design/DAG96CBWaMA/H62MROtgbWLqbfqQLMI7cQ/view?embed',
  en: 'https://www.canva.com/design/DAG96CBWaMA/H62MROtgbWLqbfqQLMI7cQ/view?embed',
  de: 'https://www.canva.com/design/DAG_PqDSDhQ/K2FvRij-94kg6L0eD9oCgQ/view?embed',
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

export default function ResourcesCard() {
  const { lang } = useI18n()
  const embedUrl = CANVA_EMBED_BY_LANG[lang] || CANVA_EMBED_BY_LANG.en

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

      <div style={{ padding: '20px 24px', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {/* Marketing Photos */}
        <div style={{
          flex: '1 1 260px', background: '#faf8fc', borderRadius: 12,
          padding: '20px 22px', border: `1px solid ${colors.lineGray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 26 }}>📁</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>Marketing Photos</div>
              <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 2 }}>All campaign & product images</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LinkButton href={DRIVE_URL} variant="solid">
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
          </div>
        </div>

        {/* Catalogues */}
        <div style={{
          flex: '2 1 400px', background: '#faf8fc', borderRadius: 12,
          padding: '20px 22px', border: `1px solid ${colors.lineGray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 26 }}>📄</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.inkPlum }}>B2B Catalogues</div>
              <div style={{ fontSize: 12, color: colors.lovelabMuted, marginTop: 2 }}>View online or download PDF</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CATALOGUES.map((cat) => (
              <div key={cat.lang} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 9,
                border: `1px solid ${colors.lineGray}`,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: colors.charcoal, minWidth: 90 }}>
                  {cat.lang} — {cat.label}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <LinkButton href={cat.canva}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    View
                  </LinkButton>
                  <LinkButton href={cat.pdf} variant="solid">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    PDF
                  </LinkButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Catalogue preview — language-aware Canva embed */}
      <div style={{ borderTop: `1px solid ${colors.lineGray}`, padding: '0 24px 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '16px 0 14px',
          fontSize: 11, fontWeight: 700, color: colors.lovelabMuted,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          Catalogue Preview
        </div>
        <div style={{
          position: 'relative', width: '100%', paddingTop: '70%',
          borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${colors.lineGray}`,
          background: '#f5f5f5',
        }}>
          <iframe
            src={embedUrl}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              border: 'none',
            }}
            loading="lazy"
            allowFullScreen
            title="B2B Catalogue"
          />
        </div>
      </div>
    </div>
  )
}
