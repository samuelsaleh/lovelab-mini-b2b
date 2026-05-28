'use client'

import { colors, fonts } from '@/lib/styles'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export default function DocumentRow({
  doc,
  mobile,
  isAdmin,
  canEdit,
  onReEdit,
  onDuplicate,
  onDownload,
  onDelete,
  onRequestInternal,
  renamingDocId,
  docRenameValue,
  setDocRenameValue,
  commitDocRename,
  startDocRename,
  docRenameLoading,
}) {
  const { t } = useI18n()
  const isRenaming = renamingDocId === doc.id

  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8',
      padding: mobile ? '12px 12px' : '12px 16px',
      display: 'flex', flexDirection: mobile ? 'column' : 'row',
      alignItems: mobile ? 'stretch' : 'center', gap: mobile ? 10 : 16,
    }}>
      {/* Top row: icon + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: doc.document_type === 'order' ? '#f0f5ff' : '#f5f5f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0, color: colors.inkPlum, fontWeight: 700,
        }}>
          {doc.document_type === 'order' ? 'PO' : 'Q'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#333',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {doc.client_company || doc.client_name || 'Unknown'}
            {canEdit && !isRenaming && (
              <button
                onClick={(e) => { e.stopPropagation(); startDocRename(doc) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#bbb', fontSize: 11, padding: '0 2px', lineHeight: 1,
                }}
                title="Rename"
              >✎</button>
            )}
          </div>

          {isRenaming ? (
            <input
              autoFocus
              value={docRenameValue}
              onChange={(e) => setDocRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDocRename(doc.id)
                if (e.key === 'Escape') commitDocRename(null)
              }}
              onBlur={() => commitDocRename(doc.id)}
              disabled={docRenameLoading}
              style={{
                fontSize: 11, padding: '3px 6px',
                border: `1px solid ${colors.lineGray}`, borderRadius: 4,
                width: '100%', marginTop: 2, fontFamily: fonts.body,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div style={{ fontSize: 11, color: '#999', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                padding: '1px 6px', borderRadius: 4,
                background: doc.document_type === 'order' ? '#e8f4ea' : '#e8f0ff',
                color: doc.document_type === 'order' ? '#2d6a4f' : '#1e40af',
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              }}>{doc.document_type}</span>
              {doc.status === 'draft' && (
                <span style={{
                  padding: '1px 6px', borderRadius: 4,
                  background: '#fff4e5', color: '#b9770e',
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                }}>Draft</span>
              )}
              {doc.order_channel === 'internal' && (
                <span style={{
                  padding: '1px 6px', borderRadius: 4,
                  background: '#f5f0fa', color: colors.inkPlum,
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                }}>Internal</span>
              )}
              {doc.total_amount && (
                <span style={{ fontWeight: 600, color: colors.inkPlum }}>{fmt(doc.total_amount)}</span>
              )}
              <span>{new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {doc.events?.name && (
                <span style={{ color: colors.luxeGold }}>@ {doc.events.name}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {onReEdit && doc.metadata?.formState && canEdit && (
          <button
            onClick={() => onReEdit(doc)}
            title={t('docs.reEdit')}
            style={{
              padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6,
              border: `1px solid ${colors.inkPlum}`,
              background: '#fdf7fa', color: colors.inkPlum,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
              minHeight: mobile ? 44 : 'auto',
            }}
          >{t('docs.reEdit')}</button>
        )}
        {onDuplicate && doc.metadata?.formState && (
          <button
            onClick={() => onDuplicate(doc)}
            title={t('order.duplicate') || 'Copy'}
            style={{
              padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6,
              border: '1px solid #e0e0e0',
              background: '#fff', color: '#555',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
              minHeight: mobile ? 44 : 'auto',
            }}
          >{t('order.duplicate') || 'Copy'}</button>
        )}
        <button
          onClick={() => onDownload(doc)}
          title="Download"
          style={{
            padding: mobile ? '10px 14px' : '7px 12px', borderRadius: 6, border: 'none',
            background: colors.inkPlum, color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: fonts.body,
            minHeight: mobile ? 44 : 'auto',
          }}
        >Download</button>
        {canEdit && (
          <button
            onClick={() => onDelete(doc)}
            title={t('docs.delete')}
            style={{
              padding: mobile ? '10px 12px' : '7px 10px', borderRadius: 6,
              border: '1px solid #fecaca', background: '#fef2f2',
              color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
              minHeight: mobile ? 44 : 'auto',
            }}
          >Delete</button>
        )}
        {isAdmin && doc.order_channel !== 'internal' && (
          <button
            onClick={() => onRequestInternal(doc)}
            title="Move to Internal Orders (removes from analytics)"
            style={{
              padding: mobile ? '10px 12px' : '7px 10px', borderRadius: 6,
              border: '1px solid #e0e0e0', background: '#f9f9f9',
              color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: fonts.body,
              minHeight: mobile ? 44 : 'auto', whiteSpace: 'nowrap',
            }}
          >→ Internal</button>
        )}
      </div>
    </div>
  )
}
