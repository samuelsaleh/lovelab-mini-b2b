'use client'

import { useState, useMemo } from 'react'
import { colors, fonts } from '@/lib/styles'
import { getAllCollectionIds, getCollectionLabel, getCollectionImages, getCollectionFilters } from '@/lib/packshot-lookup'
import { canSeeCollection } from '@/lib/catalog'
import PackshotLightbox from './PackshotLightbox'

const COLLECTION_ORDER = [
  'CUTY', 'CUBIX', 'M3', 'M4', 'M5', 'MF', 'SSF', 'SSPF',
  // 2026 new collections (Moonlight, Sienna, Iconix). SI1 (Sienna One) has no
  // photos yet, so it is filtered out automatically until images are added.
  'MFM', 'MNO', 'MNH',
  'SI1', 'SI2P', 'SI3', 'SI4', 'SI5',
  'ZAHA', 'LUVA', 'LUMA', 'RIV4', 'RIV8', 'LIN3', 'LIN5',
]

export default function PackshotGallery({ onClose, inline = false, isAdmin = false, profile = null }) {
  const availableIds = getAllCollectionIds()
  const viewer = profile ?? (isAdmin ? { role: 'admin' } : null)
  const orderedIds = COLLECTION_ORDER.filter(
    id => availableIds.includes(id) && canSeeCollection(id, viewer),
  )

  const [activeCollection, setActiveCollection] = useState(orderedIds[0] || null)
  const [housingFilter, setHousingFilter] = useState(null)
  const [shapeFilter, setShapeFilter] = useState(null)
  const [subgroupFilter, setSubgroupFilter] = useState(null)

  const [lightboxIdx, setLightboxIdx] = useState(null)

  const filters = useMemo(
    () => activeCollection ? getCollectionFilters(activeCollection) : { housings: [], shapes: [], subgroups: [] },
    [activeCollection],
  )

  const images = useMemo(() => {
    if (!activeCollection) return []
    return getCollectionImages(activeCollection, {
      housing: housingFilter,
      shape: shapeFilter,
      subgroup: subgroupFilter,
    })
  }, [activeCollection, housingFilter, shapeFilter, subgroupFilter])

  const handleCollectionChange = (id) => {
    setActiveCollection(id)
    setHousingFilter(null)
    setShapeFilter(null)
    setSubgroupFilter(null)
  }

  const panelContent = (
    <div
      style={inline ? {
        background: '#fff', display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%', overflow: 'hidden',
      } : {
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 1100,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${colors.lineGray}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.inkPlum, fontFamily: fonts.body }}>
          Product Packshots
        </div>
        {!inline && (
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20, color: '#999',
              cursor: 'pointer', padding: '0 4px',
            }}
          >
            ×
          </button>
        )}
      </div>

        {/* Collection Tabs */}
        <div style={{
          padding: '12px 24px', borderBottom: `1px solid ${colors.lineGray}`,
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {orderedIds.map(id => (
            <button
              key={id}
              onClick={() => handleCollectionChange(id)}
              style={{
                padding: '6px 14px', borderRadius: 20,
                fontSize: 12, fontWeight: 600, fontFamily: fonts.body,
                cursor: 'pointer', transition: 'all .12s',
                border: activeCollection === id ? `1px solid ${colors.inkPlum}` : `1px solid ${colors.lineGray}`,
                background: activeCollection === id ? colors.inkPlum : '#fff',
                color: activeCollection === id ? '#fff' : colors.charcoal,
              }}
            >
              {getCollectionLabel(id)}
            </button>
          ))}
        </div>

        {/* Sub-filters */}
        {(filters.housings.length > 1 || filters.shapes.length > 0 || filters.subgroups.length > 0) && (
          <div style={{
            padding: '10px 24px', borderBottom: `1px solid ${colors.lineGray}`,
            display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
          }}>
            {filters.subgroups.length > 0 && (
              <FilterGroup
                label="Type"
                options={filters.subgroups}
                value={subgroupFilter}
                onChange={setSubgroupFilter}
              />
            )}
            {filters.shapes.length > 0 && (
              <FilterGroup
                label="Shape"
                options={filters.shapes}
                value={shapeFilter}
                onChange={setShapeFilter}
              />
            )}
            {filters.housings.length > 1 && (
              <FilterGroup
                label="Housing"
                options={filters.housings}
                value={housingFilter}
                onChange={setHousingFilter}
                labelMap={HOUSING_LABELS}
              />
            )}
          </div>
        )}

        {/* Image Grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
        }}>
          {images.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 40,
              color: colors.lovelabMuted, fontSize: 13,
            }}>
              No photos available for this selection
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}>
              {images.map((img, idx) => (
                <div
                  key={img.url}
                  onClick={() => setLightboxIdx(idx)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 10, overflow: 'hidden',
                    border: `1px solid ${colors.lineGray}`,
                    background: '#faf8fc',
                    transition: 'box-shadow .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(93,58,94,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  <img
                    src={img.url}
                    alt={img.color || 'Product'}
                    loading="lazy"
                    style={{
                      width: '100%', height: 180,
                      objectFit: 'contain', display: 'block',
                      padding: 8,
                    }}
                  />
                  <div style={{
                    padding: '8px 10px',
                    fontSize: 12, fontWeight: 600,
                    color: colors.charcoal,
                    textAlign: 'center',
                    borderTop: `1px solid ${colors.lineGray}`,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {img.color || img.housing || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 24px', borderTop: `1px solid ${colors.lineGray}`,
          fontSize: 11, color: colors.lovelabMuted, textAlign: 'center',
          flexShrink: 0,
        }}>
          {images.length} photo{images.length !== 1 ? 's' : ''}
        </div>
      </div>
  )

  return (
    <>
      {inline ? panelContent : (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(74, 37, 69, 0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={onClose}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {panelContent}
          </div>
        </div>
      )}
      {lightboxIdx !== null && (
        <PackshotLightbox
          images={images}
          currentIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
    </>
  )
}

const HOUSING_LABELS = {
  WG: 'White Gold',
  YG: 'Yellow Gold',
  RG: 'Rose Gold',
  MIX: 'Mix',
}

function FilterGroup({ label, options, value, onChange, labelMap }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: colors.lovelabMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginRight: 2,
      }}>
        {label}
      </span>
      <button
        onClick={() => onChange(null)}
        style={pillStyle(value === null)}
      >
        All
      </button>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={pillStyle(value === opt)}
        >
          {(labelMap && labelMap[opt]) || opt}
        </button>
      ))}
    </div>
  )
}

const pillStyle = (active) => ({
  padding: '6px 14px', borderRadius: 20,
  fontSize: 12, fontWeight: 600, fontFamily: fonts.body,
  cursor: 'pointer', transition: 'all .12s',
  border: active ? `1.5px solid ${colors.inkPlum}` : `1px solid ${colors.lineGray}`,
  background: active ? colors.inkPlum : '#fff',
  color: active ? '#fff' : '#666',
})
