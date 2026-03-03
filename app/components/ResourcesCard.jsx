'use client'

import { colors, fonts } from '@/lib/styles'

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

function LinkButton({ href, children, variant = 'outline' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
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

      <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {/* Marketing Photos */}
        <div style={{
          flex: '1 1 220px', background: '#faf8fc', borderRadius: 10,
          padding: '16px 18px', border: `1px solid ${colors.lineGray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>📁</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>Marketing Photos</div>
              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 1 }}>All campaign & product images</div>
            </div>
          </div>
          <LinkButton href={DRIVE_URL} variant="solid">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Open Google Drive
          </LinkButton>
        </div>

        {/* Catalogues */}
        <div style={{
          flex: '2 1 340px', background: '#faf8fc', borderRadius: 10,
          padding: '16px 18px', border: `1px solid ${colors.lineGray}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.inkPlum }}>B2B Catalogues</div>
              <div style={{ fontSize: 11, color: colors.lovelabMuted, marginTop: 1 }}>View online or download PDF</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CATALOGUES.map((cat) => (
              <div key={cat.lang} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 8,
                border: `1px solid ${colors.lineGray}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.charcoal, minWidth: 80 }}>
                  {cat.lang} — {cat.label}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <LinkButton href={cat.canva}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    View
                  </LinkButton>
                  <LinkButton href={cat.pdf} variant="solid">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
    </div>
  )
}
