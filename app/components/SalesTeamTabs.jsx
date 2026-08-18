'use client'

import { useRouter } from 'next/navigation'
import { colors, fonts } from '@/lib/styles'

const TABS = [
  {
    id: 'agents',
    label: 'Agents',
    href: '/admin/agents',
    description: 'Independent salespeople who place orders and earn commission.',
  },
  {
    id: 'assistants',
    label: 'Assistants',
    href: '/admin/assistants',
    description: 'Internal helpers with access only to the fairs you assign.',
  },
  {
    id: 'partners',
    label: 'Partner Teams',
    href: '/admin/organizations',
    description: 'Companies with one or more agents, shared totals, and one settlement.',
  },
]

export default function SalesTeamTabs({ active }) {
  const router = useRouter()
  const current = TABS.find((tab) => tab.id === active) || TABS[0]

  return (
    <section style={{ marginBottom: 22, fontFamily: fonts.body }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{
          margin: 0,
          color: colors.inkPlum,
          fontFamily: fonts.heading,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.015em',
        }}>
          Sales Team
        </h1>
        <p style={{ margin: '5px 0 0', color: colors.lovelabMuted, fontSize: 13 }}>
          Everyone who sells or supports sales, organized by how they work.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Sales Team sections"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          maxWidth: 510,
          border: `1px solid ${colors.lovelabBorder}`,
          borderRadius: 12,
          background: '#f6f1f5',
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => router.push(tab.href)}
              style={{
                flex: '1 0 auto',
                minHeight: 38,
                padding: '8px 15px',
                border: 'none',
                borderRadius: 8,
                background: selected ? '#fff' : 'transparent',
                color: selected ? colors.inkPlum : colors.lovelabMuted,
                boxShadow: selected ? '0 1px 4px rgba(74,37,69,0.12)' : 'none',
                fontFamily: fonts.body,
                fontSize: 12,
                fontWeight: selected ? 700 : 600,
                cursor: selected ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <p style={{
        margin: '9px 0 0',
        color: colors.textLight,
        fontSize: 12,
        lineHeight: 1.45,
      }}>
        {current.description}
      </p>
    </section>
  )
}
