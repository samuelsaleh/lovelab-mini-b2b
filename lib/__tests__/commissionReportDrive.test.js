/**
 * @jest-environment node
 *
 * lib/commissionReportDrive.uploadCommissionReportToDrive — Phase 22
 *
 * Sam's 2026-05-13 redesign drops the year/month tree in favour of a
 * flat per-agent structure: <root>/<Agent>/<file>.xlsx. The uploader
 * now delegates folder resolution to ensureAgentDriveFolder() and just
 * shoves bytes into whatever folder it gets back. Tests cover:
 *
 *   ✓ Skips with 'env_not_set' when env var is missing
 *   ✓ Skips with 'missing_args' when buffer/agentName/periodKey is missing
 *   ✓ Uses cachedFolderId without touching getOrCreateSubfolder
 *   ✓ Resolves a fresh folder via getOrCreateSubfolder when no cache
 *   ✓ Filename = "<safe-agent> - <periodKey>.xlsx" with .xlsx mime
 *   ✓ Filename sanitiser strips slashes / colons / wildcards
 *   ✓ webViewLink built from the new file id
 *   ✓ Returns ok:false / 'drive_upload_failed' on Drive API error
 *   ✓ Returns ok:false / 'folder_resolve_failed' when helper errors
 */

const mockUploadFileToDrive    = jest.fn();
const mockGetOrCreateSubfolder = jest.fn();

jest.mock('../google-drive.js', () => ({
  uploadFileToDrive:    (...a) => mockUploadFileToDrive(...a),
  getOrCreateSubfolder: (...a) => mockGetOrCreateSubfolder(...a),
}));

const { uploadCommissionReportToDrive } = require('../commissionReportDrive.js');

const validArgs = {
  buffer: Buffer.from('fake-xlsx'),
  agentName: 'Marc Schlund',
  periodKey: '2026-05-13-1422',
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID;
  mockUploadFileToDrive.mockResolvedValue({ id: 'drive-file-id' });
});

describe('uploadCommissionReportToDrive — guards', () => {
  test('returns env_not_set when env var missing', async () => {
    const res = await uploadCommissionReportToDrive(validArgs);
    expect(res).toMatchObject({ ok: false, skipped: true, reason: 'env_not_set' });
    expect(mockUploadFileToDrive).not.toHaveBeenCalled();
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
  });

  test('returns missing_args when buffer absent', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await uploadCommissionReportToDrive({ ...validArgs, buffer: null });
    expect(res).toMatchObject({ ok: false, reason: 'missing_args' });
  });

  test('returns missing_args when agentName absent', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await uploadCommissionReportToDrive({ ...validArgs, agentName: '' });
    expect(res).toMatchObject({ ok: false, reason: 'missing_args' });
  });

  test('returns missing_args when periodKey absent', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await uploadCommissionReportToDrive({ ...validArgs, periodKey: '' });
    expect(res).toMatchObject({ ok: false, reason: 'missing_args' });
  });
});

describe('uploadCommissionReportToDrive — folder resolution', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
  });

  test('uses cachedFolderId without calling getOrCreateSubfolder', async () => {
    const res = await uploadCommissionReportToDrive({
      ...validArgs,
      cachedFolderId: 'cached-folder-id',
    });

    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalled();
    expect(mockUploadFileToDrive).toHaveBeenCalledWith(
      'cached-folder-id',
      'Marc Schlund - 2026-05-13-1422.xlsx',
      validArgs.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.ok).toBe(true);
    expect(res.folderId).toBe('cached-folder-id');
    expect(res.folderFromCache).toBe(true);
  });

  test('resolves a fresh per-agent folder when cachedFolderId is null', async () => {
    mockGetOrCreateSubfolder.mockResolvedValueOnce('fresh-folder-id');

    const res = await uploadCommissionReportToDrive({
      ...validArgs,
      cachedFolderId: null,
    });

    expect(mockGetOrCreateSubfolder).toHaveBeenCalledWith('root-id', 'Marc Schlund');
    expect(res.ok).toBe(true);
    expect(res.folderId).toBe('fresh-folder-id');
    expect(res.folderFromCache).toBe(false);
  });

  test('returns folder_resolve_failed when getOrCreateSubfolder throws', async () => {
    mockGetOrCreateSubfolder.mockRejectedValueOnce(new Error('Drive search 503'));

    const res = await uploadCommissionReportToDrive(validArgs);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe('folder_resolve_failed');
    expect(res.error).toContain('Drive search 503');
    expect(mockUploadFileToDrive).not.toHaveBeenCalled();
  });
});

describe('uploadCommissionReportToDrive — file upload', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    mockGetOrCreateSubfolder.mockResolvedValue('agent-folder-id');
  });

  test('filename = "<safe-agent> - <periodKey>.xlsx" with xlsx mime', async () => {
    const res = await uploadCommissionReportToDrive(validArgs);

    expect(mockUploadFileToDrive).toHaveBeenCalledWith(
      'agent-folder-id',
      'Marc Schlund - 2026-05-13-1422.xlsx',
      validArgs.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.fileId).toBe('drive-file-id');
    expect(res.webViewLink).toBe('https://drive.google.com/file/d/drive-file-id/view');
  });

  test('cron-style YYYY-MM periodKey produces a clean monthly filename', async () => {
    await uploadCommissionReportToDrive({
      ...validArgs,
      periodKey: '2026-04',
    });
    expect(mockUploadFileToDrive.mock.calls[0][1])
      .toBe('Marc Schlund - 2026-04.xlsx');
  });

  test('sanitises slashes / colons / wildcards out of the filename', async () => {
    await uploadCommissionReportToDrive({ ...validArgs, agentName: 'A/B C:D *? <weird>' });
    expect(mockUploadFileToDrive.mock.calls[0][1])
      .toBe('A-B C-D -- -weird- - 2026-05-13-1422.xlsx');
  });

  test('returns ok:false / drive_upload_failed when uploadFileToDrive throws', async () => {
    mockUploadFileToDrive.mockRejectedValue(new Error('Drive 500'));

    const res = await uploadCommissionReportToDrive(validArgs);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('drive_upload_failed');
    expect(res.error).toContain('Drive 500');
  });
});
