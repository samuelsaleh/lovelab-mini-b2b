/**
 * @jest-environment node
 *
 * lib/commissionReportDrive.uploadCommissionReportToDrive — Phase 19/B6
 *
 * The uploader maps a (year, month) onto Sam's existing Google Drive
 * structure: <root>/<year>/<month>/<file>.xlsx with multilingual month
 * folder matching ("Mai" === "May" === "Mei"). Tests cover:
 *
 *   ✓ Skips with reason 'env_not_set' when env var is missing
 *   ✓ Skips with 'missing_args' when buffer/agentName/period info is missing
 *   ✓ Skips with 'bad_period_key' for malformed periodKey
 *
 *   ── Year folder resolution ───────────────────────────────
 *   ✓ Drills into <root>/<year>/ when a year subfolder exists
 *   ✓ Treats <root> AS the year folder when its name starts with the year
 *     (Sam's current setup: env points at "2026" folder)
 *   ✓ Auto-creates a year subfolder when root is parent-of-years
 *     (env points at "Agents" folder, no 2026 subfolder yet)
 *
 *   ── Month folder resolution ──────────────────────────────
 *   ✓ Picks the existing French folder "Mai" when periodKey is 2026-05
 *   ✓ Creates an English-named folder ("April") when no alias matches
 *   ✓ Returns folderName so the caller can confirm what was used
 *
 *   ── File upload ──────────────────────────────────────────
 *   ✓ Uploads with sanitised "<Agent> - <Month Year>.xlsx" filename
 *   ✓ Returns webViewLink built from the new file ID
 *   ✓ Returns ok:false with error on Drive API failure
 */

const mockUploadFileToDrive    = jest.fn();
const mockFindFolderByAnyName  = jest.fn();
const mockGetOrCreateSubfolder = jest.fn();
const mockGetFolderInfo        = jest.fn();

jest.mock('../google-drive.js', () => ({
  uploadFileToDrive:    (...a) => mockUploadFileToDrive(...a),
  findFolderByAnyName:  (...a) => mockFindFolderByAnyName(...a),
  getOrCreateSubfolder: (...a) => mockGetOrCreateSubfolder(...a),
  getFolderInfo:        (...a) => mockGetFolderInfo(...a),
}));

const { uploadCommissionReportToDrive } = require('../commissionReportDrive.js');

const validArgs = {
  buffer: Buffer.from('fake-xlsx'),
  agentName: 'Nicolas Vial',
  periodLabel: 'May 2026',
  periodKey: '2026-05',
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
    expect(mockFindFolderByAnyName).not.toHaveBeenCalled();
  });

  test('returns missing_args when buffer absent', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await uploadCommissionReportToDrive({ ...validArgs, buffer: null });
    expect(res).toMatchObject({ ok: false, reason: 'missing_args' });
  });

  test('returns bad_period_key for malformed periodKey', async () => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    const res = await uploadCommissionReportToDrive({ ...validArgs, periodKey: 'May 2026' });
    expect(res).toMatchObject({ ok: false, reason: 'bad_period_key' });
  });
});

describe('uploadCommissionReportToDrive — year folder resolution', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
  });

  test('drills into <root>/<year>/ when a year subfolder exists', async () => {
    mockFindFolderByAnyName.mockImplementation((parentId, names) => {
      if (parentId === 'root-id' && names.includes('2026')) {
        return Promise.resolve({ id: 'year-2026-id', name: '2026' });
      }
      // 2nd call: month lookup inside year folder — finds Mai
      return Promise.resolve({ id: 'mai-id', name: 'Mai' });
    });

    const res = await uploadCommissionReportToDrive(validArgs);

    expect(res.ok).toBe(true);
    expect(res.yearFolderId).toBe('year-2026-id');
    expect(res.yearFolderName).toBe('2026');
    expect(res.folderId).toBe('mai-id');
    expect(res.folderName).toBe('Mai');
    expect(mockGetFolderInfo).not.toHaveBeenCalled(); // didn't need to inspect root
  });

  test("treats <root> as year folder when its name starts with the year (Sam's current setup)", async () => {
    // No <year> subfolder under root...
    mockFindFolderByAnyName.mockImplementationOnce(() => Promise.resolve(null));
    // Root's own name starts with "2026"
    mockGetFolderInfo.mockResolvedValue({ id: 'root-id', name: '2026' });
    // Month lookup finds "Mai"
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'mai-id', name: 'Mai' }),
    );

    const res = await uploadCommissionReportToDrive(validArgs);

    expect(res.ok).toBe(true);
    expect(res.yearFolderId).toBe('root-id');
    expect(res.yearFolderName).toBe('2026');
    expect(mockGetOrCreateSubfolder).not.toHaveBeenCalledWith('root-id', '2026');
  });

  test('treats root as parent-of-years and auto-creates the year subfolder', async () => {
    // No <year> subfolder under root
    mockFindFolderByAnyName.mockImplementationOnce(() => Promise.resolve(null));
    // Root's name does NOT start with the year
    mockGetFolderInfo.mockResolvedValue({ id: 'root-id', name: 'Agents' });
    // getOrCreateSubfolder creates a fresh "2026" folder
    mockGetOrCreateSubfolder.mockResolvedValueOnce('new-year-id');
    // Month lookup inside the new year folder finds nothing → create May
    mockFindFolderByAnyName.mockImplementationOnce(() => Promise.resolve(null));
    mockGetOrCreateSubfolder.mockResolvedValueOnce('new-may-id');

    const res = await uploadCommissionReportToDrive(validArgs);

    expect(res.ok).toBe(true);
    expect(res.yearFolderId).toBe('new-year-id');
    expect(res.yearFolderName).toBe('2026');
    expect(mockGetOrCreateSubfolder).toHaveBeenNthCalledWith(1, 'root-id', '2026');
    expect(mockGetOrCreateSubfolder).toHaveBeenNthCalledWith(2, 'new-year-id', 'May');
    expect(res.createdMonthFolder).toBe(true);
  });
});

describe('uploadCommissionReportToDrive — month folder resolution', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
  });

  test('picks "Mai" when it exists for periodKey 2026-05', async () => {
    // year folder found
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'year-id', name: '2026' }),
    );
    // month lookup — passed candidates and Mai is one of them
    mockFindFolderByAnyName.mockImplementationOnce((parentId, names) => {
      expect(parentId).toBe('year-id');
      expect(names).toEqual(['May', 'Mai', 'Mei']);
      return Promise.resolve({ id: 'mai-id', name: 'Mai' });
    });

    const res = await uploadCommissionReportToDrive(validArgs);
    expect(res.folderName).toBe('Mai');
    expect(res.createdMonthFolder).toBe(false);
  });

  test('creates the English-named folder when no alias matches (April case)', async () => {
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'year-id', name: '2026' }),
    );
    // No April / Avril folder yet
    mockFindFolderByAnyName.mockImplementationOnce(() => Promise.resolve(null));
    mockGetOrCreateSubfolder.mockResolvedValueOnce('new-april-id');

    const res = await uploadCommissionReportToDrive({
      ...validArgs,
      periodKey: '2026-04',
      periodLabel: 'April 2026',
    });

    expect(res.folderName).toBe('April');
    expect(res.createdMonthFolder).toBe(true);
    expect(mockGetOrCreateSubfolder).toHaveBeenCalledWith('year-id', 'April');
  });

  test('passes correct French aliases for May (Mai)', async () => {
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'year-id', name: '2026' }),
    );
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'mai-id', name: 'Mai' }),
    );

    await uploadCommissionReportToDrive(validArgs);

    const monthCall = mockFindFolderByAnyName.mock.calls[1];
    expect(monthCall[1]).toContain('May');
    expect(monthCall[1]).toContain('Mai');
    expect(monthCall[1]).toContain('Mei');
  });

  test('passes correct aliases for September (English/French same)', async () => {
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'year-id', name: '2026' }),
    );
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'sep-id', name: 'September' }),
    );

    await uploadCommissionReportToDrive({
      ...validArgs,
      periodKey: '2026-09',
      periodLabel: 'September 2026',
    });

    const monthCall = mockFindFolderByAnyName.mock.calls[1];
    expect(monthCall[1]).toEqual(['September', 'Septembre', 'September']);
  });
});

describe('uploadCommissionReportToDrive — file upload', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_COMMISSION_REPORTS_FOLDER_ID = 'root-id';
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'year-id', name: '2026' }),
    );
    mockFindFolderByAnyName.mockImplementationOnce(() =>
      Promise.resolve({ id: 'mai-id', name: 'Mai' }),
    );
  });

  test('uploads with sanitised filename + xlsx mime + returns webViewLink', async () => {
    const res = await uploadCommissionReportToDrive(validArgs);

    expect(mockUploadFileToDrive).toHaveBeenCalledWith(
      'mai-id',
      'Nicolas Vial - May 2026.xlsx',
      validArgs.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.fileId).toBe('drive-file-id');
    expect(res.webViewLink).toBe('https://drive.google.com/file/d/drive-file-id/view');
  });

  test('sanitises slashes / colons / wildcards out of the filename', async () => {
    await uploadCommissionReportToDrive({ ...validArgs, agentName: 'A/B C:D *? <weird>' });
    expect(mockUploadFileToDrive.mock.calls[0][1]).toBe(
      'A-B C-D -- -weird- - May 2026.xlsx',
    );
  });

  test('returns ok:false when uploadFileToDrive throws', async () => {
    mockUploadFileToDrive.mockRejectedValue(new Error('Drive 500'));

    const res = await uploadCommissionReportToDrive(validArgs);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('drive_upload_failed');
    expect(res.error).toContain('Drive 500');
  });

  test('propagates folder-lookup errors as drive_upload_failed', async () => {
    // Override the year-folder lookup to throw
    mockFindFolderByAnyName.mockReset();
    mockFindFolderByAnyName.mockRejectedValueOnce(new Error('Drive search 503'));

    const res = await uploadCommissionReportToDrive(validArgs);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('drive_upload_failed');
    expect(res.error).toContain('Drive search 503');
  });
});
