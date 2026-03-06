'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { colors, fonts } from '@/lib/styles'

const fmt = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FolderIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
  </svg>
)

const FileIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
)

/**
 * AgentFolderBrowser
 *
 * Props:
 *   agentId        - string (agent profile UUID)
 *   organizationId - string (org UUID; when set, shows folders for all org members)
 *   readOnly       - boolean (if true, hide upload/create/delete controls)
 */
export default function AgentFolderBrowser({ agentId, organizationId, readOnly = false }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Breadcrumb trail: [{ id, name }] — id=null means root
  const [breadcrumb, setBreadcrumb] = useState([])
  const currentFolderId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null

  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [rootFolderId, setRootFolderId] = useState(null)

  // Create subfolder
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)

  // File upload
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)

  // Rename
  const [renamingId, setRenamingId] = useState(null)
  const [renameType, setRenameType] = useState(null) // 'folder' | 'file'
  const [renameValue, setRenameValue] = useState('')

  const loadContents = useCallback(async () => {
    if (!agentId && !organizationId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    setUploadMsg(null)

    try {
      const foldersParams = new URLSearchParams()
      if (organizationId) foldersParams.set('organization_id', organizationId)
      if (agentId) foldersParams.set('agent_id', agentId)
      if (currentFolderId) foldersParams.set('parent_id', currentFolderId)

      const [foldersRes, filesRes] = await Promise.all([
        fetch(`/api/agent-folders?${foldersParams}`),
        currentFolderId ? fetch(`/api/agent-folder-files?folder_id=${currentFolderId}`) : Promise.resolve(null),
      ])

      const foldersData = await foldersRes.json()
      let loadedFolders = foldersData.folders || []

      // Self-healing: auto-provision folders if none exist and org is set
      if (!currentFolderId && loadedFolders.length === 0 && organizationId) {
        try {
          const provRes = await fetch(`/api/organizations/${organizationId}/folders/provision`, { method: 'POST' })
          if (provRes.ok) {
            const retryRes = await fetch(`/api/agent-folders?${foldersParams}`)
            const retryData = await retryRes.json()
            loadedFolders = retryData.folders || []
          }
        } catch {
          // provisioning is best-effort
        }
      }

      setFolders(loadedFolders)

      if (!currentFolderId && loadedFolders.length > 0) {
        setRootFolderId(loadedFolders[0].id)
      }

      if (filesRes) {
        const filesData = await filesRes.json()
        setFiles(filesData.files || [])
      } else if (!currentFolderId && loadedFolders.length > 0) {
        const rootFilesRes = await fetch(`/api/agent-folder-files?folder_id=${loadedFolders[0].id}`)
        const rootFilesData = await rootFilesRes.json()
        setFiles(rootFilesData.files || [])
      } else {
        setFiles([])
      }
    } catch {
      setError('Failed to load folder contents')
    } finally {
      setLoading(false)
    }
  }, [agentId, organizationId, currentFolderId])

  useEffect(() => {
    loadContents()
  }, [loadContents])

  const handleOpenFolder = (folder) => {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }])
  }

  const handleBreadcrumbNav = (index) => {
    setBreadcrumb(prev => prev.slice(0, index))
  }

  const handleCreateFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      const res = await fetch('/api/agent-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, name: newFolderName.trim(), parent_id: currentFolderId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to create folder'); return; }
      setNewFolderName('')
      setShowNewFolder(false)
      await loadContents()
    } catch {
      setError('Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleDeleteFolder = async (folderId) => {
    if (!confirm('Delete this folder and all its contents?')) return
    try {
      const res = await fetch(`/api/agent-folders/${folderId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to delete'); return; }
      await loadContents()
    } catch {
      setError('Failed to delete folder')
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    const targetFolderId = currentFolderId || rootFolderId
    if (!file || !targetFolderId) return
    if (file.size > 25 * 1024 * 1024) { setUploadMsg('File too large (max 25 MB)'); return; }
    setUploading(true)
    setUploadMsg(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder_id', targetFolderId)
    try {
      const res = await fetch('/api/agent-folder-files', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setUploadMsg(d.error || 'Upload failed'); return; }
      setUploadMsg('Uploaded!')
      await loadContents()
    } catch {
      setUploadMsg('Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return
    try {
      const res = await fetch(`/api/agent-folder-files/${fileId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to delete'); return; }
      await loadContents()
    } catch {
      setError('Failed to delete file')
    }
  }

  const handleDownload = async (fileId, fileName) => {
    try {
      const res = await fetch(`/api/agent-folder-files/${fileId}`)
      const d = await res.json()
      if (!res.ok || !d.url) {
        setError(d.error || 'Failed to get download URL')
        return
      }
      const a = document.createElement('a')
      a.href = d.url
      a.download = fileName
      a.target = '_blank'
      a.click()
    } catch {
      setError('Failed to download file')
    }
  }

  const startRename = (id, type, currentName) => {
    setRenamingId(id)
    setRenameType(type)
    setRenameValue(currentName)
  }

  const commitRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || !renamingId) { setRenamingId(null); return }
    try {
      const endpoint = renameType === 'folder'
        ? `/api/agent-folders/${renamingId}`
        : `/api/agent-folder-files/${renamingId}`
      const body = renameType === 'folder' ? { name: trimmed } : { name: trimmed }
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to rename')
      } else {
        if (renameType === 'folder') {
          setFolders(prev => prev.map(f => f.id === renamingId ? { ...f, name: trimmed } : f))
        } else {
          setFiles(prev => prev.map(f => f.id === renamingId ? { ...f, name: trimmed } : f))
        }
      }
    } catch {
      setError('Failed to rename')
    } finally {
      setRenamingId(null)
    }
  }

  return (
    <div style={{ fontFamily: fonts.body }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => handleBreadcrumbNav(0)}
          style={crumbStyle(breadcrumb.length === 0)}
        >
          <FolderIcon size={13} />
          Root
        </button>
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#ccc', fontSize: 12 }}>/</span>
            <button
              onClick={() => handleBreadcrumbNav(i + 1)}
              style={crumbStyle(i === breadcrumb.length - 1)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowNewFolder(v => !v)}
            style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <FolderIcon size={12} /> {currentFolderId ? 'New Subfolder' : 'New Folder'}
          </button>
          {currentFolderId && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${colors.lineGray}`, background: '#fff', color: colors.charcoal, cursor: uploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, opacity: uploading ? 0.6 : 1 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {uploading ? 'Uploading…' : 'Upload File'}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" style={{ display: 'none' }} onChange={handleUpload} />
            </>
          )}
          {uploadMsg && (
            <span style={{ fontSize: 12, color: /failed|large/i.test(uploadMsg) ? colors.danger : colors.success, alignSelf: 'center' }}>
              {uploadMsg}
            </span>
          )}
        </div>
      )}

      {/* New folder input */}
      {showNewFolder && (
        <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            style={{ flex: 1, padding: '7px 10px', border: `1px solid ${colors.lineGray}`, borderRadius: 7, fontSize: 13, fontFamily: fonts.body, outline: 'none' }}
          />
          <button type="submit" disabled={creatingFolder || !newFolderName.trim()} style={{ padding: '7px 14px', background: colors.inkPlum, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!newFolderName.trim() || creatingFolder) ? 0.6 : 1 }}>
            {creatingFolder ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => setShowNewFolder(false)} style={{ padding: '7px 10px', background: 'none', border: `1px solid ${colors.lineGray}`, borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: colors.danger }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ border: `1px solid ${colors.lineGray}`, borderRadius: 10, overflow: 'hidden' }}>
          {folders.length === 0 && files.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.lovelabMuted, fontSize: 13 }}>
              {currentFolderId ? 'This folder is empty. Use "Upload File" above to add files.' : 'No folders yet. Click "New Folder" above to create one.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {folders.map(folder => (
                  <tr key={folder.id} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                    <td style={{ padding: '10px 14px', width: 32 }}>
                      <span style={{ color: colors.luxeGold }}><FolderIcon size={16} /></span>
                    </td>
                    <td style={{ padding: '10px 4px' }}>
                      {renamingId === folder.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          onBlur={commitRename}
                          style={{ fontSize: 13, fontWeight: 600, fontFamily: fonts.body, padding: '3px 6px', border: `1px solid ${colors.lineGray}`, borderRadius: 4, width: '100%' }}
                        />
                      ) : (
                        <button
                          onClick={() => handleOpenFolder(folder)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: colors.charcoal, fontWeight: 600, fontFamily: fonts.body, padding: 0, textAlign: 'left' }}
                        >
                          {folder.name}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: '#bbb', marginRight: 10 }}>
                        {new Date(folder.created_at).toLocaleDateString('en-GB')}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => startRename(folder.id, 'folder', folder.name)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 11, padding: '2px 4px', marginRight: 2 }}
                          title="Rename folder"
                        >
                          ✎
                        </button>
                      )}
                      {!readOnly && folder.parent_id && (
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 12, padding: '2px 4px' }}
                          title="Delete folder"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {files.map(file => (
                  <tr key={file.id} style={{ borderBottom: `1px solid ${colors.lineGray}` }}>
                    <td style={{ padding: '10px 14px', width: 32 }}>
                      <span style={{ color: colors.lovelabMuted }}><FileIcon size={16} /></span>
                    </td>
                    <td style={{ padding: '10px 4px' }}>
                      {renamingId === file.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                          onBlur={commitRename}
                          style={{ fontSize: 13, fontFamily: fonts.body, padding: '3px 6px', border: `1px solid ${colors.lineGray}`, borderRadius: 4, width: '100%' }}
                        />
                      ) : (
                        <button
                          onClick={() => handleDownload(file.id, file.name)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: colors.inkPlum, fontFamily: fonts.body, padding: 0, textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(93,58,94,0.3)' }}
                        >
                          {file.name}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: '#bbb', marginRight: 6 }}>{fmt(file.file_size)}</span>
                      <span style={{ fontSize: 11, color: '#bbb', marginRight: 10 }}>
                        {new Date(file.created_at).toLocaleDateString('en-GB')}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => startRename(file.id, 'file', file.name)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 11, padding: '2px 4px', marginRight: 2 }}
                          title="Rename file"
                        >
                          ✎
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 12, padding: '2px 4px' }}
                          title="Delete file"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const crumbStyle = (active) => ({
  border: 'none',
  cursor: active ? 'default' : 'pointer',
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  color: active ? colors.inkPlum : colors.lovelabMuted,
  fontFamily: fonts.body,
  padding: '3px 6px',
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: active ? '#f4f0f5' : 'none',
})
