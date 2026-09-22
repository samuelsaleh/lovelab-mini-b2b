/**
 * Who gets a price list announcement: active and paused agents with an
 * email, grouped by the language they will be written to in.
 */
import {
  ANNOUNCE_STATUSES,
  loadAnnouncementRecipients,
  groupRecipientsByLanguage,
  describeRecipient,
} from '@/lib/priceListRecipients';

function chain(result) {
  const q = {
    select: jest.fn(() => q),
    or: jest.fn(() => q),
    is: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe('loadAnnouncementRecipients', () => {
  test('keeps active and paused agents only', async () => {
    const rows = [
      { id: '1', email: 'a@x.com', agent_status: 'active' },
      { id: '2', email: 'b@x.com', agent_status: 'paused' },
      { id: '3', email: 'c@x.com', agent_status: 'invited' },
      { id: '4', email: 'd@x.com', agent_status: 'inactive' },
      { id: '5', email: 'e@x.com', agent_status: null, is_agent: true },
    ];
    const q = chain({ data: rows, error: null });
    const admin = { from: jest.fn(() => q) };
    const out = await loadAnnouncementRecipients(admin);
    expect(out.map((r) => r.id)).toEqual(['1', '2']);
    expect(ANNOUNCE_STATUSES).toEqual(['active', 'paused']);
    expect(q.select).toHaveBeenCalledWith(expect.stringContaining('agent_language'));
    expect(q.is).toHaveBeenCalledWith('agent_deleted_at', null);
  });

  test('falls back to a select without agent_language when the column is missing', async () => {
    const first = chain({ data: null, error: { message: 'column profiles.agent_language does not exist' } });
    const second = chain({ data: [{ id: '1', email: 'a@x.com', agent_status: 'active', agent_country: 'Italy' }], error: null });
    const calls = [first, second];
    const admin = { from: jest.fn(() => calls.shift()) };
    const out = await loadAnnouncementRecipients(admin);
    expect(out).toHaveLength(1);
    expect(second.select).toHaveBeenCalledWith(expect.not.stringContaining('agent_language'));
  });

  test('throws when both selects fail', async () => {
    const bad = () => chain({ data: null, error: { message: 'boom' } });
    const admin = { from: jest.fn(() => bad()) };
    await expect(loadAnnouncementRecipients(admin)).rejects.toThrow(/boom/);
  });
});

describe('groupRecipientsByLanguage', () => {
  const profiles = [
    { id: '1', email: 'Anna@X.com', full_name: 'Anna Rossi', agent_status: 'active', agent_country: 'Italy', agent_language: null },
    { id: '2', email: 'bart@x.com', full_name: 'Bart', agent_status: 'paused', agent_country: 'Belgium', agent_language: 'nl' },
    { id: '3', email: 'carl@x.com', full_name: 'Carl', agent_status: 'active', agent_country: 'United States', agent_language: null },
    { id: '4', email: null, full_name: 'No Mail', agent_status: 'active', agent_country: 'France', agent_language: null },
    { id: '5', email: 'dora@x.com', full_name: 'Dora', agent_status: 'active', agent_country: null, agent_language: null, role: 'admin' },
  ];

  test('groups by resolved language, lowercases emails, reports fallbacks and missing emails', () => {
    const g = groupRecipientsByLanguage(profiles);
    expect(g.recipients.map((r) => r.id)).toEqual(['1', '2', '3', '5']);
    expect(g.counts).toEqual({ it: 1, nl: 1, en: 2 });
    expect(g.byLanguage.it[0]).toMatchObject({ id: '1', email: 'anna@x.com', name: 'Anna Rossi', language: 'it', languageSource: 'country' });
    expect(g.byLanguage.nl[0]).toMatchObject({ id: '2', language: 'nl', languageSource: 'stored', status: 'paused' });
    expect(g.byLanguage.en.map((r) => r.id)).toEqual(['3', '5']);
    expect(g.fallbackToEnglish.map((r) => r.id)).toEqual(['3', '5']);
    expect(g.derivedFromCountry.map((r) => r.id)).toEqual(['1']);
    expect(g.missingEmail.map((r) => r.id)).toEqual(['4']);
  });

  test('commercials (agent rows with role admin) are recipients', () => {
    const g = groupRecipientsByLanguage(profiles);
    expect(g.byLanguage.en.find((r) => r.id === '5').role).toBe('admin');
  });

  test('describeRecipient is the row shape the API returns', () => {
    expect(describeRecipient(profiles[1])).toEqual({
      id: '2', email: 'bart@x.com', name: 'Bart', status: 'paused', role: 'member', language: 'nl', languageSource: 'stored',
    });
  });

  test('empty input', () => {
    expect(groupRecipientsByLanguage([])).toMatchObject({ recipients: [], counts: {}, missingEmail: [] });
    expect(groupRecipientsByLanguage(null).recipients).toEqual([]);
  });
});
