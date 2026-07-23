/**
 * @jest-environment node
 *
 * inviteAgent must create the events.type='agent' folder so a brand-new
 * agent's first order has somewhere to file (Savvidou / SAVVIDIS, July 2026).
 */

const { inviteAgent } = require('../agents/invite');

describe('inviteAgent — ensures agent folder event', () => {
  test('calls ensureAgentFolderEvent after org provisioning for a new agent', async () => {
    const ensureAgentFolderEvent = jest.fn().mockResolvedValue('evt-1');
    const autoEnsureOrganization = jest.fn().mockResolvedValue({
      organization: { id: 'org-1' },
    });
    const provisionAgentInOrg = jest.fn();
    const grantAccess = jest.fn();
    const sendEmail = jest.fn();
    const generateTempPassword = jest.fn(() => 'TempPass1!');

    const profileRow = {
      id: 'auth-new',
      email: 'newagent@test.com',
      full_name: 'New Agent',
      is_agent: true,
      agent_status: 'invited',
      organization_id: null,
    };

    const adminSupabase = {
      from: jest.fn(() => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          upsert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: profileRow, error: null }),
        };
        return chain;
      }),
      auth: {
        admin: {
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'auth-new', email: 'newagent@test.com' } },
            error: null,
          }),
        },
      },
    };

    const result = await inviteAgent(
      adminSupabase,
      {
        email: 'newagent@test.com',
        fullName: 'New Agent',
        invitedByUserId: 'admin-1',
        sendInvite: false,
      },
      {
        ensureAgentFolderEvent,
        autoEnsureOrganization,
        provisionAgentInOrg,
        grantAccess,
        sendEmail,
        generateTempPassword,
      }
    );

    expect(result.created).toBe(true);
    expect(autoEnsureOrganization).toHaveBeenCalled();
    expect(ensureAgentFolderEvent).toHaveBeenCalledWith(adminSupabase, 'auth-new');
  });

  test('still succeeds when ensureAgentFolderEvent throws (non-blocking)', async () => {
    const ensureAgentFolderEvent = jest.fn().mockRejectedValue(new Error('boom'));
    const autoEnsureOrganization = jest.fn().mockResolvedValue({
      organization: { id: 'org-1' },
    });

    const profileRow = {
      id: 'auth-new',
      email: 'newagent2@test.com',
      full_name: 'New Agent 2',
      is_agent: true,
      agent_status: 'invited',
      organization_id: null,
    };

    const adminSupabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: profileRow, error: null }),
      })),
      auth: {
        admin: {
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'auth-new', email: 'newagent2@test.com' } },
            error: null,
          }),
        },
      },
    };

    const result = await inviteAgent(
      adminSupabase,
      {
        email: 'newagent2@test.com',
        fullName: 'New Agent 2',
        sendInvite: false,
      },
      {
        ensureAgentFolderEvent,
        autoEnsureOrganization,
        provisionAgentInOrg: jest.fn(),
        grantAccess: jest.fn(),
        sendEmail: jest.fn(),
        generateTempPassword: jest.fn(() => 'TempPass1!'),
      }
    );

    expect(result.agent.id).toBe('auth-new');
    expect(ensureAgentFolderEvent).toHaveBeenCalled();
  });
});
