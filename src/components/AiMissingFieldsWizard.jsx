import { useMemo } from 'react'
import { COLLECTIONS, HOUSING } from '../lib/catalog'
import { colors, fonts, lbl, tag, isMobile } from '../lib/styles'

function Title({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: colors.inkPlum, marginBottom: 6 }}>{children}</div>
}

function Hint({ children }) {
  return <div style={{ fontSize: 11, color: '#777', lineHeight: 1.4, marginBottom: 10 }}>{children}</div>
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#444', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function isBezelOnlyForShapyShine(selectedCarats) {
  if (!selectedCarats || selectedCarats.length === 0) return false
  // If user only selected 0.10ct, Shapy Shine is bezel-only.
  return selectedCarats.every((ct) => String(ct) === '0.10')
}

function housingOptionsFor(col, selectedCarats, state) {
  if (!col?.housing) return { typeChoices: [], options: [], needsType: false, needsAttached: false }

  if (col.housing === 'standard') {
    return { typeChoices: [], options: HOUSING.standard, needsType: false, needsAttached: false }
  }
  if (col.housing === 'goldMetal') {
    return { typeChoices: [], options: HOUSING.goldMetal, needsType: false, needsAttached: false }
  }
  if (col.housing === 'multiThree') {
    const attached = state?.multiAttached
    const list = attached === true ? HOUSING.multiThree.attached : attached === false ? HOUSING.multiThree.notAttached : []
    return { typeChoices: [], options: list, needsType: false, needsAttached: true }
  }
  if (col.housing === 'matchy') {
    const typeChoices = ['bezel', 'prong']
    const options = state?.housingType === 'bezel'
      ? HOUSING.matchyBezel.map((o) => o.label)
      : state?.housingType === 'prong'
        ? HOUSING.matchyProng.map((o) => o.label)
        : []
    return { typeChoices, options, needsType: true, needsAttached: false }
  }
  if (col.housing === 'shapyShine') {
    const bezelOnly = isBezelOnlyForShapyShine(selectedCarats)
    const typeChoices = bezelOnly ? ['bezel'] : ['bezel', 'prong']
    const options = (state?.housingType || (bezelOnly ? 'bezel' : null)) === 'bezel'
      ? HOUSING.shapyShineBezel
      : (state?.housingType === 'prong' ? HOUSING.shapyShineProng : [])
    return { typeChoices, options, needsType: !bezelOnly, needsAttached: false, bezelOnly }
  }
  return { typeChoices: [], options: [], needsType: false, needsAttached: false }
}

/**
 * Wizard to collect missing housing/shape/size before calling the AI.
 * We apply these choices per-collection (to be applied to all colors in that collection).
 */
export default function AiMissingFieldsWizard({
  open,
  collectionIds,
  aiCarats,
  values,
  onChange,
  onCancel,
  onConfirm,
}) {
  const mobile = isMobile()

  const cols = useMemo(() => {
    return (collectionIds || [])
      .map((id) => COLLECTIONS.find((c) => c.id === id))
      .filter(Boolean)
  }, [collectionIds])

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(74, 37, 69, 0.55)',
    zIndex: 500,
    display: 'flex',
    alignItems: mobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: mobile ? 0 : 16,
    fontFamily: fonts.body,
  }

  const card = {
    width: '100%',
    maxWidth: 760,
    background: '#fff',
    borderRadius: mobile ? '16px 16px 0 0' : 16,
    border: `1px solid ${colors.lineGray}`,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    padding: mobile ? 16 : 18,
    maxHeight: mobile ? '90vh' : '85vh',
    overflowY: 'auto',
  }

  const footer = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 12,
    borderTop: `1px solid ${colors.lineGray}`,
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <Title>Quick details needed before AI</Title>
        <Hint>
          To avoid missing info in the AI quote and to export cleanly to “Build manually”, please select the required options below.
        </Hint>

        {cols.map((col) => {
          const selectedCarats = aiCarats?.[col.id] || []
          const v = values?.[col.id] || {}
          const hasHousing = Boolean(col.housing)
          const hasShapes = Array.isArray(col.shapes) && col.shapes.length > 0
          const hasSizes = Array.isArray(col.sizes) && col.sizes.length > 0

          const housingMeta = housingOptionsFor(col, selectedCarats, v)
          const bezelOnly = housingMeta?.bezelOnly === true

          return (
            <div key={col.id} style={{ padding: 12, borderRadius: 12, border: `1px solid ${colors.lineGray}`, marginBottom: 10, background: colors.lumiereIvory }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: colors.inkPlum, marginBottom: 10 }}>
                {col.label}
                {selectedCarats.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#888', marginLeft: 8 }}>
                    preferred carats: {selectedCarats.join(', ')}ct
                  </span>
                )}
              </div>

              {hasHousing && (
                <Section title="Housing">
                  {col.housing === 'multiThree' && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...lbl, marginBottom: 6 }}>Attached?</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          onClick={() => onChange(col.id, { multiAttached: true, housing: '' })}
                          style={tag(v.multiAttached === true)}
                        >
                          Attached
                        </button>
                        <button
                          onClick={() => onChange(col.id, { multiAttached: false, housing: '' })}
                          style={tag(v.multiAttached === false)}
                        >
                          Not attached
                        </button>
                      </div>
                    </div>
                  )}

                  {(col.housing === 'matchy' || col.housing === 'shapyShine') && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...lbl, marginBottom: 6 }}>{col.housing === 'matchy' ? 'Setting' : 'Setting type'}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {housingMeta.typeChoices.map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              const patch = { housingType: t, housing: '' }
                              if (col.housing === 'shapyShine') {
                                // For Shapy Shine we store housing with prefix for consistency with builder.
                                patch.housing = ''
                              }
                              onChange(col.id, patch)
                            }}
                            style={tag((v.housingType || (bezelOnly ? 'bezel' : '')) === t)}
                            disabled={bezelOnly && t !== 'bezel'}
                          >
                            {t === 'bezel' ? 'Bezel' : 'Prong'}
                          </button>
                        ))}
                        {bezelOnly && (
                          <span style={{ fontSize: 10, color: '#888', alignSelf: 'center' }}>
                            (0.10ct only)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {housingMeta.options.map((opt) => {
                      const active = v.housing === opt || v.housing === `Bezel ${opt}` || v.housing === `Prong ${opt}`
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            if (col.housing === 'shapyShine') {
                              const type = v.housingType || (bezelOnly ? 'bezel' : '')
                              const housing = type === 'prong' ? `Prong ${opt}` : `Bezel ${opt}`
                              onChange(col.id, { housingType: type || 'bezel', housing })
                              return
                            }
                            onChange(col.id, { housing: opt })
                          }}
                          style={tag(active)}
                          disabled={(housingMeta.needsAttached && v.multiAttached == null) || (housingMeta.needsType && !bezelOnly && !v.housingType)}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </Section>
              )}

              {hasShapes && (
                <Section title="Shape">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {col.shapes.map((s) => (
                      <button key={s} onClick={() => onChange(col.id, { shape: s })} style={tag(v.shape === s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {hasSizes && (
                <Section title="Size">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {col.sizes.map((s) => (
                      <button key={s} onClick={() => onChange(col.id, { size: s })} style={tag(v.size === s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )
        })}

        <div style={footer}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: `1px solid ${colors.lineGray}`,
              background: '#fff',
              color: '#666',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: colors.inkPlum,
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Continue to AI →
          </button>
        </div>
      </div>
    </div>
  )
}

