/**
 * @jest-environment node
 *
 * resolveAgentFolderEventId must CREATE the folder when none exists — the
 * second safety net after invite-time provisioning (Savvidou / SAVVIDIS).
 */

describe('resolveAgentFolderEventId creates missing folder', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('delegates to ensureAgentFolderEvent (create-if-missing)', async () => {
    const ensure = jest.fn().mockResolvedValue('evt-created');
    jest.doMock('@/lib/events/ensure-agent-folder', () => ({
      ensureAgentFolderEvent: ensure,
    }));
    jest.doMock('@/lib/supabase/server', () => ({
      createAdminClient: jest.fn(),
    }));

    const { resolveAgentFolderEventId } = require('../_lib/access');
    const admin = { tag: 'admin' };
    const id = await resolveAgentFolderEventId(admin, 'agent-1');
    expect(ensure).toHaveBeenCalledWith(admin, 'agent-1');
    expect(id).toBe('evt-created');
  });
});
