import crypto from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

function base64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    return getOAuthAccessToken(clientId, clientSecret, refreshToken);
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    return getServiceAccountToken(typeof raw === 'string' ? JSON.parse(raw) : raw);
  }

  throw new Error('No Google Drive credentials configured. Set either GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET, or GOOGLE_SERVICE_ACCOUNT_KEY.');
}

async function getOAuthAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function getServiceAccountToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = base64url(sign.sign(sa.private_key));
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google SA token error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function findOrCreateFolder(parentId, folderName, token) {
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!searchRes.ok) {
    throw new Error(`Drive folder search failed (${searchRes.status}): ${await searchRes.text()}`);
  }

  const searchData = await searchRes.json();
  const existing = searchData.files || [];

  if (existing.length > 0) {
    const [keep, ...duplicates] = existing;
    // Delete all but the most recent folder to avoid split backups
    for (const dup of duplicates) {
      try {
        await fetch(`${DRIVE_FILES_URL}/${dup.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        console.warn(`[google-drive] Failed to delete duplicate backup folder ${dup.id}`);
      }
    }
    return keep.id;
  }

  const createRes = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Drive folder creation failed (${createRes.status}): ${await createRes.text()}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

export async function uploadJsonToDrive(parentFolderId, fileName, jsonData) {
  const token = await getAccessToken();
  const content = JSON.stringify(jsonData, null, 2);

  const boundary = '----BackupBoundary' + Date.now();
  const metadata = JSON.stringify({
    name: fileName,
    mimeType: 'application/json',
    parents: [parentFolderId],
  });

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed for ${fileName} (${res.status}): ${text}`);
  }

  return res.json();
}

export async function uploadFileToDrive(parentFolderId, fileName, buffer, mimeType = 'application/octet-stream') {
  const token = await getAccessToken();

  const boundary = '----BackupFileBoundary' + Date.now();
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    parents: [parentFolderId],
  });

  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf-8'
  );
  const endPart = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
  const body = Buffer.concat([metaPart, Buffer.from(buffer), endPart]);

  const res = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed for ${fileName} (${res.status}): ${text}`);
  }

  return res.json();
}

export async function createDailyBackupFolder(date) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID env var is not set');

  const token = await getAccessToken();
  const folderName = `backup-${date}`;
  return findOrCreateFolder(rootFolderId, folderName, token);
}

/**
 * Convenience wrapper: ensure a subfolder exists under the given parent,
 * fetching an access token internally so callers don't have to.
 *
 * @param {string} parentFolderId — ID of the parent (root) folder
 * @param {string} folderName     — exact name to find or create
 * @returns {Promise<string>}     — the subfolder ID
 */
export async function getOrCreateSubfolder(parentFolderId, folderName) {
  if (!parentFolderId) throw new Error('parentFolderId is required');
  if (!folderName) throw new Error('folderName is required');
  const token = await getAccessToken();
  return findOrCreateFolder(parentFolderId, folderName, token);
}

/**
 * Search a parent folder for a subfolder matching ANY of the given names.
 * Returns the first match (by Drive's response order, which is by relevance
 * then createdTime). Useful for multilingual folder naming where we want
 * to accept "May" / "Mai" / "Mei" all pointing at the same month.
 *
 * @param {string}   parentFolderId
 * @param {string[]} candidateNames — list of acceptable folder names
 * @returns {Promise<{id: string, name: string} | null>}
 */
export async function findFolderByAnyName(parentFolderId, candidateNames) {
  if (!parentFolderId) throw new Error('parentFolderId is required');
  if (!Array.isArray(candidateNames) || candidateNames.length === 0) return null;

  const token = await getAccessToken();
  const nameClauses = candidateNames
    .map((n) => `name='${String(n).replace(/'/g, "\\'")}'`)
    .join(' or ');
  const q = `(${nameClauses}) and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await fetch(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Drive folder lookup failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.files?.[0] || null;
}

/**
 * Fetch metadata (name + parents) for a Drive folder by ID. Used to
 * auto-detect whether a configured root folder is itself a year folder
 * (e.g. "2026") or the parent of year folders (e.g. "Agents").
 */
export async function getFolderInfo(folderId) {
  if (!folderId) throw new Error('folderId is required');
  const token = await getAccessToken();
  const res = await fetch(
    `${DRIVE_FILES_URL}/${encodeURIComponent(folderId)}?fields=id,name,parents,mimeType`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Drive folder info failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
