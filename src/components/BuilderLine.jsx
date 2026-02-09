import { memo } from 'react'
import { COLLECTIONS, CORD_COLORS, HOUSING } from '../lib/catalog'
import { isLight } from '../lib/utils'
import { lbl, tag, qBtn, qInp, qtyQuick, colors } from '../lib/styles'

const QTY_PRESETS = [1, 3, 5, 10]

export default memo(function BuilderLine({ line, index, total, onChange, onRemove }) {
  const col = line.collectionId ? COLLECTIONS.find((c) => c.id === line.collectionId) : null
  const palette = col ? CORD_COLORS[col.cord] || CORD_COLORS.nylon : []

  const set = (patch) => onChange(line.uid, patch)

  const toggleColor = (name) => {
    const has = line.colors.includes(name)
    set({ colors: has ? line.colors.filter((c) => c !== name) : [...line.colors, name] })
  }

  // Progress steps for summary in header
  const steps = []
  if (col) steps.push(col.label)
  if (col && line.caratIdx !== null) steps.push(`${col.carats[line.caratIdx]}ct`)
  if (line.housing) steps.push(line.housing)
  if (line.colors.length > 0) steps.push(`${line.colors.length} colors`)
  if (line.colors.length > 0) steps.push(`${line.colors.length * line.qty} pcs`)

  // What is the current step the user needs to fill?
  const needsCollection = !col
  const needsCarat = col && line.caratIdx === null
  
  // Housing logic
  const hasHousing = col && col.housing
  const needsHousing = hasHousing && line.caratIdx !== null && !line.housing
  
  // For shapyShine at 0.10ct, only Bezel is available
  const selectedCarat = col && line.caratIdx !== null ? col.carats[line.caratIdx] : null
  const shapyShineBezelOnly = col?.housing === 'shapyShine' && selectedCarat === '0.10'
  
  // Colors only after housing is set (or if no housing needed)
  const housingDone = !hasHousing || line.housing
  const needsColors = col && line.caratIdx !== null && housingDone && line.colors.length === 0
  // Qty is always shown after colors are picked (has a default)

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{ padding: '10px 14px', background: '#fafaf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => set({ expanded: !line.expanded })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#222', whiteSpace: 'nowrap' }}>
            {col ? col.label : `Line ${index + 1}`}
          </span>
          {col && (
            <span style={{ fontSize: 10, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.caratIdx !== null && `${col.carats[line.caratIdx]}ct · €${col.prices[line.caratIdx]}`}
              {line.colors.length > 0 && ` · ${line.colors.length} col · ${line.colors.length * line.qty} pcs`}
            </span>
          )}
          {!col && (
            <span style={{ fontSize: 10, color: '#bbb', fontStyle: 'italic' }}>Select a collection</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(line.uid) }}
              style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#ccc', padding: '0 4px' }}
            >
              ×
            </button>
          )}
          <span style={{ fontSize: 12, color: '#ccc', transform: line.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s', display: 'inline-block' }}>
            ▼
          </span>
        </div>
      </div>

      {/* Body — progressive disclosure */}
      {line.expanded && (
        <div style={{ padding: '12px 14px' }}>
          {/* Step 1: Collection — always visible */}
          <div style={{ marginBottom: needsCollection ? 0 : 12 }}>
            <div style={{ ...lbl, color: needsCollection ? colors.inkPlum : lbl.color }}>
              {needsCollection ? '① Choose a collection' : 'Collection'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => set({ collectionId: line.collectionId === c.id ? null : c.id, caratIdx: null, housing: null, housingType: null, multiAttached: null, colors: [], qty: c.minC })}
                  style={tag(line.collectionId === c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Carat — only after collection is selected */}
          {col && (
            <div style={{ marginBottom: needsCarat ? 0 : 12 }}>
              <div style={{ ...lbl, color: needsCarat ? colors.inkPlum : lbl.color }}>
                {needsCarat ? '② Choose carat size' : 'Carat'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {col.carats.map((ct, ci) => (
                  <button key={ct} onClick={() => set({ caratIdx: line.caratIdx === ci ? null : ci, housing: null, housingType: null, multiAttached: null })} style={tag(line.caratIdx === ci)}>
                    {ct}ct — €{col.prices[ci]}
                    <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 4 }}>ret €{col.retail[ci]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Housing — only if collection has housing and carat is selected */}
          {col && line.caratIdx !== null && hasHousing && (
            <div style={{ marginBottom: needsHousing ? 0 : 12 }}>
              <div style={{ ...lbl, color: needsHousing ? colors.inkPlum : lbl.color }}>
                {needsHousing ? '③ Choose housing' : `Housing: ${line.housing || ''}`}
              </div>

              {/* Standard housing (Yellow, White, Rose) */}
              {col.housing === 'standard' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {HOUSING.standard.map((h) => (
                    <button key={h} onClick={() => set({ housing: line.housing === h ? null : h })} style={tag(line.housing === h)}>
                      {h}
                    </button>
                  ))}
                </div>
              )}

              {/* Gold Metal housing (White Gold, Yellow Gold, Rose Gold) */}
              {col.housing === 'goldMetal' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {HOUSING.goldMetal.map((h) => (
                    <button key={h} onClick={() => set({ housing: line.housing === h ? null : h })} style={tag(line.housing === h)}>
                      {h}
                    </button>
                  ))}
                </div>
              )}

              {/* Multi Three — Attached vs Not Attached */}
              {col.housing === 'multiThree' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => set({ multiAttached: true, housing: null })}
                      style={{ ...tag(line.multiAttached === true), padding: '8px 14px' }}
                    >
                      Attached
                    </button>
                    <button
                      onClick={() => set({ multiAttached: false, housing: null })}
                      style={{ ...tag(line.multiAttached === false), padding: '8px 14px' }}
                    >
                      Not Attached
                    </button>
                  </div>
                  {line.multiAttached !== null && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(line.multiAttached ? HOUSING.multiThree.attached : HOUSING.multiThree.notAttached).map((h) => (
                        <button key={h} onClick={() => set({ housing: line.housing === h ? null : h })} style={tag(line.housing === h)}>
                          {h}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Matchy Fancy — Bezel (6) + Prong (2) */}
              {col.housing === 'matchy' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => set({ housingType: 'bezel', housing: null })}
                      style={{ ...tag(line.housingType === 'bezel'), padding: '8px 14px' }}
                    >
                      Bezel (6 options)
                    </button>
                    <button
                      onClick={() => set({ housingType: 'prong', housing: null })}
                      style={{ ...tag(line.housingType === 'prong'), padding: '8px 14px' }}
                    >
                      Prong (2 options)
                    </button>
                  </div>
                  {line.housingType === 'bezel' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {HOUSING.matchyBezel.map((h) => (
                        <button key={h.id} onClick={() => set({ housing: line.housing === h.label ? null : h.label })} style={tag(line.housing === h.label)}>
                          {h.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {line.housingType === 'prong' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {HOUSING.matchyProng.map((h) => (
                        <button key={h.id} onClick={() => set({ housing: line.housing === h.label ? null : h.label })} style={tag(line.housing === h.label)}>
                          {h.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shapy Shine Fancy — Bezel at 0.10ct, Bezel + Prong at 0.30ct+ */}
              {col.housing === 'shapyShine' && (
                <div>
                  {shapyShineBezelOnly ? (
                    /* 0.10ct — only Bezel */
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {HOUSING.shapyShineBezel.map((h) => (
                        <button key={h} onClick={() => set({ housing: line.housing === `Bezel ${h}` ? null : `Bezel ${h}`, housingType: 'bezel' })} style={tag(line.housing === `Bezel ${h}`)}>
                          Bezel {h}
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* 0.30ct+ — Bezel + Prong available */
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => set({ housingType: 'bezel', housing: null })}
                          style={{ ...tag(line.housingType === 'bezel'), padding: '8px 14px' }}
                        >
                          Bezel
                        </button>
                        <button
                          onClick={() => set({ housingType: 'prong', housing: null })}
                          style={{ ...tag(line.housingType === 'prong'), padding: '8px 14px' }}
                        >
                          Prong
                        </button>
                      </div>
                      {line.housingType === 'bezel' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {HOUSING.shapyShineBezel.map((h) => (
                            <button key={h} onClick={() => set({ housing: line.housing === `Bezel ${h}` ? null : `Bezel ${h}` })} style={tag(line.housing === `Bezel ${h}`)}>
                              {h}
                            </button>
                          ))}
                        </div>
                      )}
                      {line.housingType === 'prong' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {HOUSING.shapyShineProng.map((h) => (
                            <button key={h} onClick={() => set({ housing: line.housing === `Prong ${h}` ? null : `Prong ${h}` })} style={tag(line.housing === `Prong ${h}`)}>
                              {h}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Colors — only after housing is done (or no housing needed) */}
          {col && line.caratIdx !== null && housingDone && (
            <div style={{ marginBottom: needsColors ? 0 : 12 }}>
              <div style={{ ...lbl, color: needsColors ? colors.inkPlum : lbl.color }}>
                {needsColors ? (hasHousing ? '④ Pick colors' : '③ Pick colors') : `Colors (${line.colors.length})`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {palette.map((c) => (
                  <button
                    key={c.n}
                    title={c.n}
                    onClick={() => toggleColor(c.n)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c.h, flexShrink: 0, padding: 0,
                      border: line.colors.includes(c.n) ? '2.5px solid #222' : isLight(c.h) ? '1px solid #ddd' : '1px solid transparent',
                      cursor: 'pointer', transition: 'transform .1s',
                      transform: line.colors.includes(c.n) ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: line.colors.includes(c.n) ? '0 0 0 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  />
                ))}
              </div>
              {line.colors.length > 0 && (
                <div style={{ fontSize: 9, color: '#aaa', marginTop: 4 }}>{line.colors.join(', ')}</div>
              )}
            </div>
          )}

          {/* Step 4: Qty — only after at least one color is picked */}
          {col && line.colors.length > 0 && (
            <div>
              <div style={lbl}>Qty per color · min 1, recommended {col.minC}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                  <button style={qBtn} onClick={() => set({ qty: Math.max(1, line.qty - 1) })}>−</button>
                  <input
                    type="number"
                    value={line.qty}
                    onChange={(e) => set({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={qInp}
                  />
                  <button style={qBtn} onClick={() => set({ qty: line.qty + 1 })}>+</button>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {QTY_PRESETS.map((q) => (
                    <button key={q} onClick={() => set({ qty: q })} style={qtyQuick(line.qty === q)}>
                      {q}
                    </button>
                  ))}
                </div>
                {line.qty < col.minC && (
                  <span style={{ fontSize: 10, color: '#c0392b' }}>⚠ Below recommended min {col.minC}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
