/**
 * @jest-environment node
 *
 * lib/agentDriveFolder.ensureAgentDriveFolder — Phase 22 (2026-05-13)
 *
 * The helper returns either:
 *   - { ok: true, folderId, fromCache: true }   — cachedFolderId was given.
 *   - { ok: true, folderId, fromCache: false }  — created via getOrCreateSubfolder.
 *   - { skipped: true, reason }                 — env not set / no agent name.
 *   - { skipped: false, error }                 — Drive call threw.
 *
 * Failure stance: NEVER throws. Callers (POST /api/agents, the report
 * service) need a stable shape to wrap their best-effort try/catch.
 */

const mockGetOrCreateSubfolder = jest.fn();

jest.mock('../google-drive.js', () => ({
  getOrCreateSubfolder: (...a) => mockGetOrCreateSubfolder(...a),
}));

const { ensureAgentDriveFolder, sanitisePart } = require('../agentDriveFolder.js');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID;
});

describe('ensureAgentDriveFolder — short-circuits on cache', () => {
  test('returns cached folder id without calling Drive', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await ensureAgentDriveFolder({
      agentName: 'Marc Schlund',
      cachedFolderId: 'previously-cached-id',
    });
    expect(res).toEqual({ ok: true, folderId: 'previously-cached-id', fromCache: true });
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
  });

  test('cache hit works even when env is missing (caller already has the id)', async () => {
    const res = await ensureAgentDriveFolder({
      agentName: 'Marc Schlund',
      cachedFolderId: 'cached-id',
    });
    expect(res).toEqual({ ok: true, folderId: 'cached-id', fromCache: true });
  });

  test('second call with same cache id remains a no-op', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const a = await ensureAgentDriveFolder({ agentName: 'Marc Schlund', cachedFolderId: 'x' });
    const b = await ensureAgentDriveFolder({ agentName: 'Marc Schlund', cachedFolderId: 'x' });
    expect(a).toEqual(b);
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
  });
});

describe('ensureAgentDriveFolder — skip cases', () => {
  test('skips with env_not_set when env var missing', async () => {
    const res = await ensureAgentDriveFolder({ agentName: 'Marc Schlund' });
    expect(res).toEqual({ skipped: true, reason: 'env_not_set' });
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
  });

  test('skips with no_name when agentName is empty', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await ensureAgentDriveFolder({ agentName: '   ' });
    expect(res).toEqual({ skipped: true, reason: 'no_name' });
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
  });

  test('skips with no_name when agentName is null', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await ensureAgentDriveFolder({ agentName: null });
    expect(res).toEqual({ skipped: true, reason: 'no_name' });
  });
});

describe('ensureAgentDriveFolder — creates the folder when no cache', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
  });

  test('calls getOrCreateSubfolder with sanitised name and returns the id', async () => {
    mockGetOrCreateSubfolder.mockResolvedValueOnce('new-folder-id');
    const res = await ensureAgentDriveFolder({ agentName: 'Marc Schlund' });
    expect(mockGetOrCreateSubfolder).toHaveBeenCalledWith('root-id', 'Marc Schlund');
    expect(res).toEqual({ ok: true, folderId: 'new-folder-id', fromCache: false });
  });

  test('sanitises filesystem-hostile characters in the agent name', async () => {
    mockGetOrCreateSubfolder.mockResolvedValueOnce('clean-id');
    await ensureAgentDriveFolder({ agentName: 'A/B C:D *? <weird>' });
    expect(mockGetOrCreateSubfolder).toHaveBeenCalledWith('root-id', 'A-B C-D -- -weird-');
  });

  test('returns error (no throw) when Drive call fails', async () => {
    mockGetOrCreateSubfolder.mockRejectedValueOnce(new Error('Drive 503'));
    const res = await ensureAgentDriveFolder({ agentName: 'Marc Schlund' });
    expect(res.skipped).toBe(false);
    expect(res.error).toContain('Drive 503');
    expect(res.ok).toBeUndefined();
  });
});

describe('sanitisePart helper', () => {
  test('strips path-hostile characters', () => {
    expect(sanitisePart('A/B')).toBe('A-B');
    expect(sanitisePart('a:b')).toBe('a-b');
    expect(sanitisePart('A*?B')).toBe('A--B');
    expect(sanitisePart('"weird"')).toBe('-weird-');
    expect(sanitisePart('A   B')).toBe('A B');
    expect(sanitisePart('  trim  ')).toBe('trim');
  });

  test('handles empty / null gracefully', () => {
    expect(sanitisePart('')).toBe('');
    expect(sanitisePart(null)).toBe('');
    expect(sanitisePart(undefined)).toBe('');
  });
});
